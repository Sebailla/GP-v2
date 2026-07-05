import { describe, it, expect, vi, beforeEach } from "vitest";

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

    expect(result).toEqual({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      sessionToken: "session-token-abc",
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "correct-password",
      fakeUser.hashedPassword,
    );
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
      await auth.login("alice@example.com", "wrong");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as InstanceType<typeof AuthError>).code).toBe("INVALID_CREDENTIALS");
    expect(bcrypt.compare).toHaveBeenCalledWith("wrong", "$2a$10$some-hash");
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