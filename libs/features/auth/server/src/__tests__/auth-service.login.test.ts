import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * TDD contract for AuthService.login (slice 3 / T3.1 RED step).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`
 * "Email and Password Login" requirement (AC-1 through AC-4), these tests
 * pin the public contract of `AuthService.login`:
 *
 *  - AC-1 (success) — valid credentials return
 *      { id, email, role, sessionToken } and create a session row.
 *  - AC-2 (user-not-found) — unknown email throws AuthError('USER_NOT_FOUND').
 *  - AC-3 (wrong-password) — known email + bad password throws
 *      AuthError('INVALID_CREDENTIALS').
 *  - AC-4 (validation) — empty email or malformed email throws
 *      ValidationError at the boundary (Zod parse failed) BEFORE any
 *      DB or bcrypt call.
 *
 * The Prisma singleton from @core/database is mocked so the suite runs in
 * the sandbox without a real database. bcryptjs is also mocked to keep
 * the suite deterministic and fast (no real hashing cost).
 *
 * RED state: auth-service.js does NOT exist yet, so the dynamic imports
 * inside each `it` block throw ERR_MODULE_NOT_FOUND. Every test fails.
 * T3.2 implements the module and the suite goes GREEN.
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import { prisma } from "@core/database";
import bcrypt from "bcryptjs";
import { decode as decodeJwt } from "next-auth/jwt";

/**
 * Slice 4 NextAuth integration follow-up (post-batch 2).
 *
 * The sessionToken returned by AuthService.login + AuthService.register is
 * now a NextAuth v5 JWE (encrypted via `@auth/core/jwt#encode`) — NOT a
 * `randomUUID()` opaque string. The round-trip test below mints the
 * JWT via the production code path and asserts:
 *
 *   1. The returned `sessionToken` is a valid NextAuth JWE (decodes
 *      successfully via `@auth/core/jwt#decode` with the SAME
 *      `secret` + `salt` the API's guard uses).
 *   2. The decoded payload carries the canonical user projection
 *      (`sub`, `email`, `role`, `userId`) so the web client + the
 *      API's `JwtAuthGuard` see the same shape.
 *
 * The secret is read from `env.NEXTAUTH_SECRET`; the salt is the
 * canonical `NEXTAUTH_SESSION_TOKEN_NAME` constant. Both must match
 * the API's `JwtAuthGuard` exactly.
 */
const NEXTAUTH_SECRET_FOR_TEST = "test-secret-at-least-32-characters-long-for-hkdf";

describe("AuthService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1: success path
  it("returns { id, email, role, sessionToken } for valid credentials and creates a session", async () => {
    const { AuthService } = await import("../auth-service.js");

    const fakeUser = {
      id: "user-1",
      email: "alice@example.com",
      role: "USER" as const,
      hashedPassword: "$2a$10$irrelevant-hash-for-mock",
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(fakeUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: "session-1",
      sessionToken: "session-token-abc",
      userId: "user-1",
      expires: new Date(Date.now() + 60_000),
    });

    const auth = new AuthService(prisma);
    const result = await auth.login("alice@example.com", "correct-password");

    // Slice 4 NextAuth integration follow-up: the `sessionToken`
    // is now a NextAuth v5 JWE (5-segment dot-separated string),
    // NOT the old `randomUUID()` opaque value. The assertion below
    // pins the shape (id, email, role) and asserts the token is a
    // non-empty string; the round-trip test (further down) asserts
    // the token decodes as a valid NextAuth JWE with the canonical
    // claims.
    expect(result.id).toBe("user-1");
    expect(result.email).toBe("alice@example.com");
    expect(result.role).toBe("USER");
    expect(typeof result.sessionToken).toBe("string");
    expect(result.sessionToken.length).toBeGreaterThan(0);
    // The JWE has 5 segments (header.encryptedKey.iv.ciphertext.tag).
    expect(result.sessionToken.split(".")).toHaveLength(5);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
    expect(bcrypt.compare).toHaveBeenCalledWith("correct-password", fakeUser.hashedPassword);
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const sessionArgs = vi.mocked(prisma.session.create).mock.calls[0]?.[0];
    expect(sessionArgs?.data?.userId).toBe("user-1");
    expect(typeof sessionArgs?.data?.sessionToken).toBe("string");
    expect(sessionArgs?.data?.sessionToken?.length).toBeGreaterThan(0);
    expect(sessionArgs?.data?.expires).toBeInstanceOf(Date);
  });

  // AC-2: user not found
  it("throws AuthError('USER_NOT_FOUND') when no user matches the email", async () => {
    const { AuthService, AuthError } = await import("../auth-service.js");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.login("nobody@example.com", "any-password");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as InstanceType<typeof AuthError>).code).toBe("USER_NOT_FOUND");
    // bcrypt.compare and session.create must NOT run on the missing-user path.
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // AC-3: wrong password
  it("throws AuthError('INVALID_CREDENTIALS') when the password does not match", async () => {
    const { AuthService, AuthError } = await import("../auth-service.js");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      role: "USER" as const,
      hashedPassword: "$2a$10$some-hash",
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false);

    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      // 9 chars — passes the canonical `loginSchema.password.min(8)`
      // boundary (slice 3 batch 6: schema tightened from min(1) to
      // min(8) when the inline schema was replaced by the canonical
      // shared schema at libs/features/auth/shared/schemas/login.ts).
      // A 5-char password would fail at the schema boundary and the
      // service would throw ValidationError instead of INVALID_CREDENTIALS.
      await auth.login("alice@example.com", "wrongpass");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as InstanceType<typeof AuthError>).code).toBe("INVALID_CREDENTIALS");
    expect(bcrypt.compare).toHaveBeenCalledWith("wrongpass", "$2a$10$some-hash");
    // No session is created on a failed credential check.
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // AC-4a: validation rejects empty email
  it("throws ValidationError when email is empty (before any DB call)", async () => {
    const { AuthService, ValidationError } = await import("../auth-service.js");
    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.login("", "any-password");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    // Validation must fail at the boundary, before Prisma or bcrypt run.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // AC-4b: validation rejects malformed email
  it("throws ValidationError when email is not a valid address", async () => {
    const { AuthService, ValidationError } = await import("../auth-service.js");
    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.login("not-an-email", "any-password");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// Slice 4 NextAuth integration follow-up — round-trip JWT assertion.
//
// The sessionToken returned by AuthService.login is now a real
// NextAuth v5 JWE (encrypted via @auth/core/jwt#encode). This block
// asserts that the returned token:
//
//   - decodes successfully via @auth/core/jwt#decode with the
//     SAME secret + salt the API's JwtAuthGuard uses (round-trip),
//   - carries the canonical user projection claims (sub, email,
//     role, userId) so the web client's `auth()` helper + the
//     API's guard see the same shape.
//
// The secret is stubbed via vi.stubEnv to match the guard's
// runtime read of `env.NEXTAUTH_SECRET`. The salt is the
// canonical `NEXTAUTH_SESSION_TOKEN_NAME` constant (already
// used by the guard).
// -------------------------------------------------------------------------
describe("AuthService.login — round-trip JWT (NextAuth integration)", () => {
  const NEXTAUTH_SESSION_TOKEN_NAME = "authjs.session-token";

  beforeEach(() => {
    // The production code reads `env.NEXTAUTH_SECRET` at runtime
    // (via @core/config). Stub it before each test so the
    // @core/config singleton sees the same value the decoder
    // uses here.
    vi.stubEnv("NEXTAUTH_SECRET", NEXTAUTH_SECRET_FOR_TEST);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://test@localhost/db");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("API_URL", "http://localhost:3001");
    vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a sessionToken that decodes as a valid NextAuth JWT with the canonical user claims", async () => {
    const { AuthService } = await import("../auth-service.js");

    const fakeUser = {
      id: "user-1",
      email: "alice@example.com",
      role: "USER" as const,
      hashedPassword: "$2a$10$irrelevant-hash-for-mock",
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(fakeUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true);
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: "session-1",
      sessionToken: "session-token-abc",
      userId: "user-1",
      expires: new Date(Date.now() + 60_000),
    });

    const auth = new AuthService(prisma);
    const result = await auth.login("alice@example.com", "correct-password");

    // Round-trip: the returned sessionToken MUST decode via
    // @auth/core/jwt#decode with the same secret + salt the API's
    // guard uses (apps/api/src/shared/guards/jwt.guard.ts). This
    // is the canonical "NextAuth integration" verification: the
    // token the web client stores in its cookie is the SAME token
    // the API's guard accepts.
    const decoded = await decodeJwt({
      token: result.sessionToken,
      secret: NEXTAUTH_SECRET_FOR_TEST,
      salt: NEXTAUTH_SESSION_TOKEN_NAME,
    });

    expect(decoded).not.toBeNull();
    expect(decoded).toMatchObject({
      sub: "user-1",
      email: "alice@example.com",
      role: "USER",
      userId: "user-1",
    });
  });
});
