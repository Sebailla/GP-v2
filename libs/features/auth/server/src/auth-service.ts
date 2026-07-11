import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
import bcrypt from "bcryptjs";
import { encode as encodeJwt } from "next-auth/jwt";
import { env } from "@core/config";

import { AuthError, ValidationError } from "./errors.js";
import { BCRYPT_COST_FACTOR } from "./constants.js";
import type { UserRepository } from "./domain/interfaces/user.repository.js";
import { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository.js";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "../../shared/schemas/index.js";

// Re-export the error classes from this module so consumers (tests, the
// barrel `src/index.ts`) can import the whole AuthService surface from a
// single path. Errors are co-located with the service that throws them;
// the canonical public re-export happens at `src/index.ts`.
export { AuthError, ValidationError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";

// Re-export the canonical input types so existing consumers
// (`@features/auth` barrel → `LoginInput` / `RegisterInput`) keep
// working. The types themselves are inferred from the canonical
// schemas at `libs/features/auth/shared/schemas/{login,register}.ts`
// (design §4.2); this file does NOT define its own copy.
export type { LoginInput, RegisterInput };

/**
 * AuthService — slice 3 batch 1 (T3.2 GREEN) + slice 3 batch 6 (schemas
 * moved to libs/features/auth/shared/schemas; UserRepository port
 * wired into login + register).
 *
 * Owns the credential verification + session creation flow for the
 * "Email and Password Login" requirement (specs/auth/spec.md AC-1..AC-4)
 * and the "Sign-up" requirement (register). Other AuthService methods
 * (linkGoogleAccount, getCurrentUser) land in subsequent batches — this
 * file is intentionally minimal.
 *
 * Boundary contract (per @core/config style):
 *   1. Validate input with Zod FIRST (parse at the boundary).
 *      On failure: throw ValidationError. No DB call is made.
 *   2. Look up the user. Missing -> AuthError(USER_NOT_FOUND).
 *   3. Verify the password via bcryptjs.compare.
 *      Mismatch -> AuthError(INVALID_CREDENTIALS).
 *   4. Create a Session row with a random UUID sessionToken.
 *   5. Return { id, email, role, sessionToken }.
 *
 * Input schemas (canonical) live at
 * `libs/features/auth/shared/schemas/{login,register}.ts` per design
 * §4.2 + ESLint rule `no-schemas-outside-shared`; this service
 * imports them through the schemas barrel. The previous
 * file-local `loginInputSchema` / `registerInputSchema` +
 * corresponding `eslint-disable @gpr/boundary/no-schemas-outside-shared`
 * directive are removed in slice 3 batch 6.
 *
 * Persistence ports (per architecture-standards skill: services depend
 * on the port, NOT the concrete Prisma client):
 *  - UserRepository: read-side (findByEmail) — wired in slice 3 batch 6
 *    (this commit). The default port implementation
 *    \`PrismaUserRepository\` shares the same prisma instance, so
 *    existing tests that mock \`@core/database\` keep working without
 *    changes.
 *  - PrismaClient (direct): write-side \`session.create\` for the
 *    login + register flows. The SessionRepository port (slice 3
 *    batch 6, T3.6b) ships read + revoke methods today; the
 *    session-create will land as a future port extension (not in
 *    scope for this batch — the brief notes
 *    \`prisma.session.*\` direct writes stay for now).
 *
 * The constructor takes an optional PrismaClient (DI-friendly: tests
 * inject a mock; production injects the @core/database singleton).
 * The UserRepository is also optional — when omitted, the service
 * auto-constructs a \`PrismaUserRepository\` over the same prisma
 * instance. Two-arg form \`(prisma, userRepo)\` lets tests inject
 * custom repos (the future slice 4 controller wires a real
 * \`PrismaUserRepository\`).
 */

/**
 * Public result shape for AuthService.login. Matches AC-1 of the auth
 * spec's Sign-in requirement.
 */
export type LoginResult = {
  id: string;
  email: string;
  role: string;
  sessionToken: string;
};

/**
 * Default session TTL — 1 hour, matching the slice-wide convention used
 * by the upcoming SessionService (T3.6+). Kept as a constant here so the
 * test can assert `expires` is a Date without coupling to the future
 * service.
 */
const SESSION_TTL_MS = 60 * 60 * 1000;

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly userRepo: UserRepository;

  constructor(prisma?: PrismaClient, userRepo?: UserRepository) {
    const client = prisma ?? defaultPrisma;
    this.prisma = client;
    this.userRepo = userRepo ?? new PrismaUserRepository(client);
  }

  /**
   * Verify a user's credentials and create a new session.
   *
   * Errors:
   *  - ValidationError — input failed Zod parse (empty email, malformed
   *    email, empty password). Thrown BEFORE any DB or bcrypt call.
   *  - AuthError('USER_NOT_FOUND') — no user matches the email.
   *  - AuthError('INVALID_CREDENTIALS') — user found but bcrypt.compare
   *    returned false.
   *
   * Successful return matches `LoginResult`; `sessionToken` is the value
   * the caller should hand to the client (cookie / Authorization header).
   */
  async login(email: string, password: string): Promise<LoginResult> {
    // 1. Boundary validation.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          path: issue.path.map((segment) =>
            typeof segment === "symbol" ? String(segment) : segment,
          ),
          message: issue.message,
        })),
      );
    }

    // 2. Look up the user via the UserRepository port (slice 3
    //    batch 6 R3 follow-up: drop direct prisma.user.*). The
    //    port owns the persistence boundary; the adapter
    //    (PrismaUserRepository) routes to prisma under the hood.
    const user = await this.userRepo.findByEmail(parsed.data.email);
    if (user === null) {
      throw new AuthError("USER_NOT_FOUND");
    }

    // 3. Verify the password. `bcrypt.compare` is constant-time; the
    // hashedPassword column may be null for OAuth-only accounts, in
    // which case any password attempt must fail with INVALID_CREDENTIALS
    // (do NOT leak the account-existence signal).
    const hashed = user.hashedPassword;
    if (hashed === null || hashed === undefined) {
      throw new AuthError("INVALID_CREDENTIALS");
    }
    const ok = await bcrypt.compare(parsed.data.password, hashed);
    if (!ok) {
      throw new AuthError("INVALID_CREDENTIALS");
    }

    // 4. Create the session. sessionToken is a NextAuth v5 JWE
    // (encrypted via @auth/core/jwt#encode); expires is now +
    // SESSION_TTL_MS. The Session model (User-session relation) is
    // declared in libs/core/database/prisma/schema.prisma. The JWT
    // payload mirrors the canonical `jwt` callback projection in
    // apps/api/src/lib/auth.config.ts: `sub`, `email`, `role`,
    // `userId`, plus `name` + `picture` (the NextAuth default claims).
    // The `salt` MUST match `NEXTAUTH_SESSION_TOKEN_NAME` so the
    // API's `JwtAuthGuard` and the web client's `auth()` helper
    // decode the cookie with the same HKDF-derived key.
    const sessionToken = await encodeJwt({
      token: {
        name: null,
        email: user.email,
        picture: null,
        sub: user.id,
        userId: user.id,
        role: String(user.role),
      },
      secret: env.NEXTAUTH_SECRET,
      salt: "authjs.session-token",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    // The Session row is still created (for audit + TTL — slice 3 batch
    // 6b's `PrismaSessionRepository` reads it for the
    // GET /auth/sessions + DELETE /auth/sessions/:id endpoints), but the
    // token returned to the caller is the freshly-minted NextAuth JWE
    // (`sessionToken` variable), NOT the value returned by
    // `prisma.session.create` (which Prisma may transform if the column
    // has a @default or a setter). The two values are equal in this
    // slice; we deliberately return `sessionToken` so future refactors
    // (e.g. dropping the Session row) don't accidentally surface a
    // raw DB value instead of the canonical JWT.
    await this.prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // 5. Project the public result. role is whatever Prisma returns
    // (Role enum string — 'USER' | 'ADMIN'); callers cast to their
    // local role type if needed.
    return {
      id: user.id,
      email: user.email,
      role: String(user.role),
      sessionToken,
    };
  }

  /**
   * Register a new user with email + password (optional display name).
   *
   * Errors:
   *  - ValidationError — input failed Zod parse (empty email, malformed
   *    email, password shorter than 8 chars). Thrown BEFORE any DB or
   *    bcrypt call.
   *  - AuthError('EMAIL_ALREADY_EXISTS') — a user with this email is
   *    already in the database (caught at the uniqueness check, BEFORE
   *    hashing or persisting anything).
   *
   * On success, returns `LoginResult` (same shape as login — the
   * register flow is a one-shot sign-up: it creates the user AND a
   * session so the client lands authenticated immediately).
   *
   * Boundary contract:
   *   1. Validate input with Zod FIRST (parse at the boundary).
   *   2. Normalize empty name to null (empty string is the form's
   *      natural empty-state; persisting `""` would clutter SELECTs).
   *   3. Check email uniqueness. If taken → AuthError.
   *   4. Hash password with bcryptjs at cost factor 10.
   *      Cost 10 is the reference-repo convention (per design §4.1);
   *      the auth-rbac skill recommends ≥12 for production — slice 4+
   *      surfaces the cost factor as env-configurable.
   *   5. Create the User row with the hashed credential.
   *   6. Create a Session row with a random UUID sessionToken.
   *   7. Return { id, email, role, sessionToken }.
   */
  async register(email: string, password: string, name?: string | null): Promise<LoginResult> {
    // 1. Boundary validation.
    const parsed = registerSchema.safeParse({ email, password, name });
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          path: issue.path.map((segment) =>
            typeof segment === "symbol" ? String(segment) : segment,
          ),
          message: issue.message,
        })),
      );
    }

    // 2. Normalize empty / missing name to null. The `name` column on
    // User is `String?` — persisting "" would make equality checks
    // (e.g. "WHERE name = ''") surprising and would render as an empty
    // string in the UI instead of "no name set".
    const normalizedName: string | null =
      parsed.data.name === undefined || parsed.data.name === "" ? null : parsed.data.name;

    // 3. Email uniqueness check via the UserRepository port.
    //    Done BEFORE hashing so the duplicate-email path costs
    //    a single SELECT, not a bcrypt round-trip.
    const existing = await this.userRepo.findByEmail(parsed.data.email);
    if (existing !== null) {
      throw new AuthError("EMAIL_ALREADY_EXISTS");
    }

    // 4. Hash the password. bcryptjs cost 10 — see method docstring.
    const hashed = await bcrypt.hash(parsed.data.password, BCRYPT_COST_FACTOR);

    // 5. Create the User. `role` defaults to USER at the schema level;
    // we set it explicitly here so the contract is visible at the call
    // site and so future admin-promotion paths have an obvious place
    // to branch on.
    const user = await this.prisma.user.create({
      data: {
        email: parsed.data.email,
        hashedPassword: hashed,
        name: normalizedName,
        role: "USER",
      },
    });

    // 6. Mint the session. sessionToken is a NextAuth v5 JWE
    // (encrypted via @auth/core/jwt#encode) — same shape as the
    // login flow. The canonical user projection lives in the
    // JWT payload: `sub`, `email`, `role`, `userId`, plus
    // NextAuth defaults `name` + `picture`. The `salt` MUST
    // match `NEXTAUTH_SESSION_TOKEN_NAME` so the API's
    // `JwtAuthGuard` and the web client's `auth()` helper
    // decode the cookie with the same HKDF-derived key.
    const sessionToken = await encodeJwt({
      token: {
        name: normalizedName,
        email: user.email,
        picture: null,
        sub: user.id,
        userId: user.id,
        role: String(user.role),
      },
      secret: env.NEXTAUTH_SECRET,
      salt: "authjs.session-token",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // 7. Project the public result — same shape as LoginResult so the
    // client can dispatch the same redirect-after-auth code path for
    // both sign-in and sign-up.
    return {
      id: user.id,
      email: user.email,
      role: String(user.role),
      sessionToken,
    };
  }
}
