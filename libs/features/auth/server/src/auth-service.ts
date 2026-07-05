import { randomUUID } from "node:crypto";

import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { AuthError, ValidationError } from "./errors.js";

// Re-export the error classes from this module so consumers (tests, the
// barrel `src/index.ts`) can import the whole AuthService surface from a
// single path. Errors are co-located with the service that throws them;
// the canonical public re-export happens at `src/index.ts`.
export { AuthError, ValidationError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";

/**
 * AuthService — slice 3 batch 1 (T3.2 GREEN).
 *
 * Owns the credential verification + session creation flow for the
 * "Email and Password Login" requirement (specs/auth/spec.md AC-1..AC-4).
 * Other AuthService methods (register, linkGoogleAccount, getCurrentUser,
 * password reset hooks) land in subsequent batches — this file is
 * intentionally minimal.
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
 * The constructor takes a PrismaClient (DI-friendly: tests inject a mock;
 * production injects the @core/database singleton). When the constructor
 * argument is omitted, the @core/database singleton is used so call
 * sites can write `new AuthService()` without explicit wiring.
 */

// Inline Zod schema for the login boundary.
//
// The slice-wide rule (`@gpr/boundary/no-schemas-outside-shared`) wants
// Zod schemas under libs/features/<x>/shared/schemas/. T3.2 keeps the
// login schema co-located with the service for the minimal slice (no
// client form yet — slice 4 adds the Next.js LoginForm and the
// canonical shared/schemas/login.ts lands there so the form can import
// the same definition for react-hook-form + @hookform/resolvers/zod
// validation). File-level disable is the cleanest fit while the schema
// is private to the service.
/* eslint-disable @gpr/boundary/no-schemas-outside-shared --
   T3.2 inlines loginInputSchema in auth-service.ts;
   canonical schema lands in libs/features/auth/shared/schemas/login.ts with slice 4. */
const loginInputSchema = z.object({
  email: z.string().min(1, "email is required").email("email is not a valid address"),
  password: z.string().min(1, "password is required"),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

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

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
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
    const parsed = loginInputSchema.safeParse({ email, password });
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

    // 2. Look up the user.
    const user = await this.prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
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

    // 4. Create the session. sessionToken is a random UUID; expires is
    // now + SESSION_TTL_MS. The Session model (User-session relation) is
    // declared in libs/core/database/prisma/schema.prisma.
    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.prisma.session.create({
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
      sessionToken: session.sessionToken,
    };
  }
}