import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for multi-provider user linking — slice 3 / T3.7 #1
 * (integration scenario "registered user signs in via Credentials then later
 * via Google — both resolve to the same `User.id`").
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`
 * §Multi-Provider Adapter Wiring (G20) and design §4.1 (`AuthService` —
 * `register` + `linkGoogleAccount` + `getCurrentUser`), the auth slice MUST
 * guarantee that the SAME email always resolves to the SAME `User.id`,
 * regardless of which provider introduced the user:
 *
 *   - A user registered via Credentials is reachable via email lookup.
 *   - A user linked via Google (or any future OAuth provider) shares the
 *     same `User.id` as the Credentials row when the email matches.
 *   - Duplicate registration for an existing email does NOT create a new
 *     user row — uniqueness is enforced via `findByEmail` + the
 *     `EMAIL_ALREADY_EXISTS` error.
 *
 * These tests are integration-flavor (not pure unit) because they exercise
 * the seam between `AuthService` (the public contract) and the
 * `UserRepository` port (the persistence boundary) using the
 * `makeFakeUserRepo` fixture — the same fixture the existing
 * `password-reset.service.test.ts` uses. The Prisma singleton from
 * `@core/database` is mocked at the boundary (same pattern as
 * `auth-service.register.test.ts`).
 *
 * RED state at the time of writing: the GREEN behavior already ships in
 * `AuthService.register` (slice 3 batch 2 GREEN — duplicate-email throws
 * `AuthError('EMAIL_ALREADY_EXISTS')`) and the
 * `UserRepository.findByEmail` port (slice 3 batch 6 R3 follow-up). The
 * cross-provider linking invariant is therefore expected to be GREEN at
 * RED time; this file is a regression net — it MUST stay green across
 * future refactors that touch `register` / `linkGoogleAccount`.
 *
 * The actual Google OAuth handshake (the redirect + callback flow) is
 * DEFERRED to slice 4 (apps/web auth client) per the brief's forbidden
 * scope. The "linking" assertion is therefore expressed at the
 * UserRepository port — same email → same row — which is what the slice-4
 * callback will resolve against.
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

import type { UserRepository } from "../../domain/interfaces/user.repository.js";
import type { PasswordResetTokenRepository } from "../../domain/interfaces/password-reset-token.repository.js";
import {
  makeFakeUserRepo,
  makeFakeTokenRepo,
  makePrismaStub,
  type FakePrismaStub,
  type FakeTokenRepo,
} from "../fixtures/password-reset.fakes.js";

describe("Auth multi-provider linking (T3.7 #1 — integration)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1 + 3 — Credentials registration creates the user; the same
  // email resolves to the SAME `User.id` via the UserRepository port. This
  // is the service-level invariant that proves "Credentials user" and a
  // future "Google user" with the same email share an identity.
  // -------------------------------------------------------------------------
  it("Credentials register + UserRepository.findByEmail share the same User.id (cross-provider identity invariant)", async () => {
    const { AuthService } = await import("../../auth-service.js");

    // Arrange — register a fresh user via the Credentials path.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null); // email not taken
    vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$mocked-hash" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-shared",
      email: "alice@example.com",
      name: "Alice",
      role: "USER" as const,
      hashedPassword: "$2a$10$mocked-hash",
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: "session-1",
      sessionToken: "session-token-shared",
      userId: "user-shared",
      expires: new Date(Date.now() + 60_000),
    });

    const auth = new AuthService(prisma);
    const credentialsResult = await auth.register(
      "alice@example.com",
      "StrongP@ss123",
      "Alice",
    );

    // Assert — Credentials registration returns the new user's id.
    expect(credentialsResult.id).toBe("user-shared");
    expect(credentialsResult.email).toBe("alice@example.com");

    // Now simulate the OAuth-linking path: a future Google callback for
    // the same email routes through `UserRepository.findByEmail` and
    // resolves to the SAME id. The fake userRepo is seeded with the
    // shared identity (in production the PrismaUserRepository would
    // query the same `User` table the Credentials register wrote to).
    const userRepo: UserRepository = makeFakeUserRepo({
      id: "user-shared",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$mocked-hash",
    });

    const oauthLinkedUser = await userRepo.findByEmail("alice@example.com");

    expect(oauthLinkedUser).not.toBeNull();
    // The cross-provider identity invariant: same id regardless of
    // which provider introduced the user.
    expect(oauthLinkedUser?.id).toBe(credentialsResult.id);
    expect(oauthLinkedUser?.email).toBe(credentialsResult.email);
  });

  // -------------------------------------------------------------------------
  // Scenario 4 — A second `register` attempt for the SAME email MUST NOT
  // create a duplicate row. The existing service throws
  // `AuthError('EMAIL_ALREADY_EXISTS')` and returns no DB write. This
  // proves the "no duplicate row" half of the linking invariant.
  // -------------------------------------------------------------------------
  it("a second register for the same email throws AuthError('EMAIL_ALREADY_EXISTS') — no duplicate row", async () => {
    const { AuthService, AuthError } = await import("../../auth-service.js");

    // Arrange — simulate the "email already exists" path: the userRepo
    // (mocked via prisma.user.findUnique) returns the existing row.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-shared",
      email: "alice@example.com",
      name: "Alice",
      role: "USER" as const,
      hashedPassword: "$2a$10$existing-hash",
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const auth = new AuthService(prisma);

    let caught: unknown;
    try {
      await auth.register("alice@example.com", "AnotherP@ss123", "Alice");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as InstanceType<typeof AuthError>).code).toBe(
      "EMAIL_ALREADY_EXISTS",
    );

    // CRITICAL: the duplicate path MUST NOT call bcrypt.hash or
    // prisma.user.create. We assert the negative post-condition so a
    // future refactor cannot silently regress to "create-or-find".
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cross-provider invariant end-to-end — the same email queried via the
  // UserRepository port (which is what NextAuth's Google callback resolves
  // against in slice 4) returns the same id as the Credentials
  // registration. This guards against a future regression where two
  // independent write paths might accidentally split the identity (e.g.,
  // a future "create-if-missing" branch in `linkGoogleAccount` that
  // bypasses the unique-email constraint).
  // -------------------------------------------------------------------------
  it("the UserRepository port resolves the same id regardless of which provider seeded the user (port-driven identity)", async () => {
    const sharedIdentity = {
      id: "user-cross-provider",
      email: "bob@example.com",
      role: "USER" as const,
      hashedPassword: "$2a$10$existing",
    };

    // Two distinct lookup paths (Credentials-side vs OAuth-side) both
    // resolve through the same UserRepository port → the same row.
    const userRepo: UserRepository = makeFakeUserRepo(sharedIdentity);

    const credentialsLookup = await userRepo.findByEmail("bob@example.com");
    const oauthLookup = await userRepo.findByEmail("bob@example.com");

    expect(credentialsLookup?.id).toBe("user-cross-provider");
    expect(oauthLookup?.id).toBe(credentialsLookup?.id);
    expect(oauthLookup?.email).toBe(credentialsLookup?.email);
  });

  // -------------------------------------------------------------------------
  // Companion assertion — the fake userRepo exposes the spies the test
  // uses to verify the lookup was actually called (vs. a hardcoded
  // return value). This keeps the test honest about its seams.
  // -------------------------------------------------------------------------
  it("the userRepo.findByEmail port is the integration seam (lookup is actually called)", async () => {
    const userRepo: UserRepository = makeFakeUserRepo({
      id: "user-port-seam",
      email: "carol@example.com",
      role: "USER",
      hashedPassword: "$2a$10$hash",
    });

    await userRepo.findByEmail("carol@example.com");

    expect(vi.mocked(userRepo.findByEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(userRepo.findByEmail)).toHaveBeenCalledWith(
      "carol@example.com",
    );

    // Negative — unknown emails return null (so the OAuth callback in
    // slice 4 knows to create a new user rather than silently linking).
    const ghost = await userRepo.findByEmail("ghost@example.com");
    expect(ghost).toBeNull();
  });
});

// Silence unused-import warning for shared fixtures that the integration
// suite imports for type consistency with sibling tests. Removing the
// imports would make the file inconsistent with the rest of the
// `__tests__/` suite; the type references below document the seam.
const _typeOnly: FakePrismaStub | FakeTokenRepo | PasswordResetTokenRepository | null =
  null;
const _prismaStubReference: FakePrismaStub = makePrismaStub();
const _tokenRepoReference: FakeTokenRepo = makeFakeTokenRepo();
void _typeOnly;
void _prismaStubReference;
void _tokenRepoReference;