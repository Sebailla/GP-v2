import { describe, it, expect, vi, beforeEach } from "vitest";

import { BCRYPT_COST_FACTOR } from "../constants.js";

/**
 * TDD contract for AuthService.register (slice 3 batch 2 / brief T3.3 RED).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.1
 * (AuthService.register surface) and the auth spec's Sign-up scenarios,
 * these tests pin the public contract of `AuthService.register`:
 *
 *  - AC-1 (success) — valid input creates a User (with a bcrypt-hashed
 *      password, NEVER plain), creates a Session row, and returns
 *      { id, email, role, sessionToken }.
 *  - AC-2 (email-already-exists) — known email throws
 *      AuthError('EMAIL_ALREADY_EXISTS') BEFORE creating the user.
 *  - AC-3 (weak-password) — passwords shorter than 8 chars throw
 *      ValidationError at the boundary (Zod parse failed) BEFORE any
 *      DB or bcrypt call.
 *  - AC-4 (invalid-email) — malformed email throws ValidationError at
 *      the boundary BEFORE any DB or bcrypt call.
 *  - Edge case (missing-name) — empty-string name is treated as null;
 *      registration succeeds and `prisma.user.create` is called with
 *      `name: null` (NOT the empty string).
 *
 * RED state: auth-service.ts exists (T3.2 landed) but does NOT yet
 * expose a `register` method. The dynamic import inside each `it`
 * block resolves, the `new AuthService(prisma)` constructor runs, but
 * calling `auth.register(...)` throws TypeError: auth.register is not
 * a function. Every test fails for the expected "feature missing"
 * reason.
 *
 * The Prisma singleton from @core/database is mocked so the suite runs
 * in the sandbox without a real database. bcryptjs is also mocked to
 * keep the suite deterministic (no real hashing cost).
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
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

describe("AuthService.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1: success path
  it("creates a user with a bcrypt-hashed password and returns { id, email, role, sessionToken }", async () => {
    const { AuthService } = await import("../auth-service.js");

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null); // email not taken
    vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$mocked-hash-value");
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-new",
      email: "alice@example.com",
      name: "Alice",
      role: "USER" as const,
      hashedPassword: "$2a$10$mocked-hash-value",
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: "session-1",
      sessionToken: "session-token-xyz",
      userId: "user-new",
      expires: new Date(Date.now() + 60_000),
    });

const auth = new AuthService(prisma);
    const result = await auth.register("alice@example.com", "StrongP@ss123", "Alice");

    // Slice 4 NextAuth integration follow-up: the `sessionToken`
    // is now a NextAuth v5 JWE (5-segment dot-separated string),
    // NOT the old `randomUUID()` opaque value. The assertion below
    // pins the shape (id, email, role) and asserts the token is a
    // non-empty 5-segment string; the round-trip test further
    // down asserts the token decodes as a valid NextAuth JWE.
    expect(result.id).toBe("user-new");
    expect(result.email).toBe("alice@example.com");
    expect(result.role).toBe("USER");
    expect(typeof result.sessionToken).toBe("string");
    expect(result.sessionToken.length).toBeGreaterThan(0);
    expect(result.sessionToken.split(".")).toHaveLength(5);

    // 1. Uniqueness check ran first
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });

        // 2. Password was hashed with bcrypt at BCRYPT_COST_FACTOR (NOT stored plain)
        expect(bcrypt.hash).toHaveBeenCalledWith(
          "StrongP@ss123",
          BCRYPT_COST_FACTOR,
        );

    // 3. User row was created with the hashed password, NOT the plain one
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const createArgs = vi.mocked(prisma.user.create).mock.calls[0]?.[0];
    expect(createArgs?.data?.email).toBe("alice@example.com");
    expect(createArgs?.data?.name).toBe("Alice");
    expect(createArgs?.data?.role).toBe("USER");
    expect(createArgs?.data?.hashedPassword).toBe("$2a$10$mocked-hash-value");
    // CRITICAL invariant: the stored credential is the hash, never the plain password
    expect(createArgs?.data?.hashedPassword).not.toBe("StrongP@ss123");

    // 4. Session row was created with a non-empty token and Date expiry
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const sessionArgs = vi.mocked(prisma.session.create).mock.calls[0]?.[0];
    expect(sessionArgs?.data?.userId).toBe("user-new");
    expect(typeof sessionArgs?.data?.sessionToken).toBe("string");
    expect((sessionArgs?.data?.sessionToken ?? "").length).toBeGreaterThan(0);
    expect(sessionArgs?.data?.expires).toBeInstanceOf(Date);
  });

  // AC-2: email already exists
  it("throws AuthError('EMAIL_ALREADY_EXISTS') when the email is already taken", async () => {
    const { AuthService, AuthError } = await import("../auth-service.js");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-existing",
      email: "existing@example.com",
      name: "Existing",
      role: "USER" as const,
      hashedPassword: "$2a$10$some-hash",
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.register("existing@example.com", "StrongP@ss123", "Existing");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as InstanceType<typeof AuthError>).code).toBe("EMAIL_ALREADY_EXISTS");

    // No further side effects on the duplicate-email path
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // AC-3: weak password (less than 8 chars)
  it("throws ValidationError when password is shorter than 8 chars (before any DB call)", async () => {
    const { AuthService, ValidationError } = await import("../auth-service.js");
    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.register("alice@example.com", "123", "Alice");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);

    // Validation must fail at the boundary, before Prisma or bcrypt run
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // AC-4: invalid email
  it("throws ValidationError when email is not a valid address", async () => {
    const { AuthService, ValidationError } = await import("../auth-service.js");
    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.register("not-an-email", "StrongP@ss123", "Alice");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);

    // Same no-I/O guarantee as AC-3
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // Edge case (regression of the older "empty name → null" behavior).
  //
  // Slice 3 batch 6 replaces the inline `registerInputSchema` in
  // auth-service.ts with the canonical
  // `registerSchema` from libs/features/auth/shared/schemas/register.ts
  // (design §4.2). The canonical schema makes `name` a REQUIRED
  // field with `min(1).max(120)` — so an empty-string name is now an
  // invalid input that throws ValidationError at the boundary BEFORE
  // any DB or bcrypt call. This matches design §4.2 verbatim: name is
  // a user-visible display name, not an optional handle.
it("throws ValidationError when name is empty (canonical schema makes name REQUIRED)", async () => {
    const { AuthService, ValidationError } = await import("../auth-service.js");
    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.register("alice@example.com", "StrongP@ss123", "");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);

    // No side effects on the empty-name path
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// Slice 4 NextAuth integration follow-up — round-trip JWT assertion.
// Mirrors the test added to auth-service.login.test.ts.
// -------------------------------------------------------------------------
describe("AuthService.register — round-trip JWT (NextAuth integration)", () => {
  const NEXTAUTH_SESSION_TOKEN_NAME = "authjs.session-token";
  const NEXTAUTH_SECRET_FOR_TEST =
    "test-secret-at-least-32-characters-long-for-hkdf";

  it("returns a sessionToken that decodes as a valid NextAuth JWT with the canonical user claims", async () => {
    const { AuthService } = await import("../auth-service.js");

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null); // email not taken
    vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$mocked-hash-value");
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-new",
      email: "alice@example.com",
      name: "Alice",
      role: "USER" as const,
      hashedPassword: "$2a$10$mocked-hash-value",
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: "session-1",
      sessionToken: "session-token-xyz",
      userId: "user-new",
      expires: new Date(Date.now() + 60_000),
    });

    const auth = new AuthService(prisma);
    const result = await auth.register(
      "alice@example.com",
      "StrongP@ss123",
      "Alice",
    );

    const { decode: decodeJwt } = await import("next-auth/jwt");
    const decoded = await decodeJwt({
      token: result.sessionToken,
      secret: NEXTAUTH_SECRET_FOR_TEST,
      salt: NEXTAUTH_SESSION_TOKEN_NAME,
    });

    expect(decoded).not.toBeNull();
    expect(decoded).toMatchObject({
      sub: "user-new",
      email: "alice@example.com",
      role: "USER",
      userId: "user-new",
      name: "Alice",
    });
  });
});