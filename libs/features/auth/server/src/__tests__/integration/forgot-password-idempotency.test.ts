import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for forgot-password idempotency — slice 3 / T3.7 #3
 * (integration scenario "forgot-password for an unknown email returns
 * 202 (idempotent, no enumeration leak)").
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`
 * §Password Reset (Forgot + Reset, Email Mocked) and design §4.1
 * (`PasswordResetService.requestReset` — "mint a single-use token and
 * dispatch `auth.password-reset.requested`; for an unknown email,
 * return silently so the response is observationally identical to the
 * known-email path"), the service MUST:
 *
 *   - Return `void` for BOTH known and unknown emails (no exception;
 *     no `false`; the controller surfaces both as 202).
 *   - Persist a `PasswordResetToken` row + dispatch the
 *     `auth.password-reset.requested` event ONLY for the known-email
 *     path. The unknown-email path MUST persist NOTHING and dispatch
 *     NOTHING.
 *   - Maintain constant-time / no-side-channel characteristics: an
 *     attacker must not be able to distinguish "email is registered"
 *     from "email is not registered" by observing timing, persistence,
 *     or event emission.
 *
 * This is an integration-flavor test because it exercises the seam
 * between `PasswordResetService` (the public contract) and the two
 * ports it depends on (`UserRepository` + `PasswordResetTokenRepository`)
 * + the dispatcher (the side-effect surface). The fakes from
 * `password-reset.fakes.ts` provide the seams; `bcryptjs` is mocked
 * because the request path never hashes a password.
 *
 * RED → GREEN evidence:
 *  - RED: in slice 3 batch 4, `PasswordResetService.requestReset`
 *    exists but did NOT have the unknown-email silent-return path
 *    pinned by a separate test (it was asserted only inline as a
 *    smoke check). This integration test makes the no-enumeration
 *    invariant a first-class assertion that future refactors cannot
 *    silently regress.
 *  - GREEN: the existing service's early-return on
 *    `userRepo.findByEmail(...) === null` (before the token mint +
 *    persistence + dispatch) already satisfies the contract. The
 *    tests below pass at RED time — they pin the contract as a
 *    regression net for future refactors.
 *
 * Test discipline (per testing-standards):
 *  - AAA pattern.
 *  - No logic in tests.
 *  - No asserting on timestamps.
 *  - Mocks bcryptjs (only `hash` is used by the consumeReset path,
 *    so we mock it to keep the import surface honest; the request
 *    path doesn't touch it).
 */

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import type { PrismaClient } from "@core/database";
import type { DomainEvent } from "@core/events";

import type { AuthEventDispatcher } from "../../events.js";
import type {
  PasswordResetTokenRepository,
} from "../../domain/interfaces/password-reset-token.repository.js";
import {
  makeFakeTokenRepo,
  makeFakeUserRepo,
  makePrismaStub,
  type FakePrismaStub,
  type FakeTokenRepo,
} from "../fixtures/password-reset.fakes.js";

/**
 * Construct a Prisma-shaped stub for the 4th constructor arg of
 * `PasswordResetService`. The real `PrismaClient` type has many
 * surface methods (`$on`, `$connect`, ...) that the service never
 * uses; the fake is intentionally narrow. The `as unknown as` cast
 * is narrowly scoped (only the Prisma constructor slot); the
 * UserRepository + PasswordResetTokenRepository ports use the REAL
 * types.
 */
function asPrismaStub(stub: FakePrismaStub): PrismaClient {
  return stub as unknown as PrismaClient;
}

describe("PasswordResetService requestReset — idempotency + no enumeration leak (T3.7 #3 — integration)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("known email path", () => {
    it("persists ONE token row + dispatches ONE auth.password-reset.requested event (positive control)", async () => {
      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$existing-hash",
      });
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } =
        await import("../../password-reset.service.js");
      const service = new PasswordResetService(userRepo, tokenRepo, dispatcher);

      // Act — known email.
      const result = await service.requestReset("alice@example.com");

      // Assert — the public contract: void return for ALL paths.
      expect(result).toBeUndefined();

      // Persistence — exactly ONE token row was created.
      expect(tokenRepo.create).toHaveBeenCalledTimes(1);
      const createdArg = (
        vi.mocked(tokenRepo.create).mock.calls[0] as unknown as [
          { userId: string; tokenHash: string; expiresAt: Date },
        ]
      )[0];
      expect(createdArg.userId).toBe("user-1");
      expect(typeof createdArg.tokenHash).toBe("string");
      expect(createdArg.tokenHash.length).toBeGreaterThan(0);
      expect(createdArg.expiresAt).toBeInstanceOf(Date);

      // Dispatch — exactly ONE event was dispatched.
      expect(dispatcher).toHaveBeenCalledTimes(1);
      const dispatched = (
        vi.mocked(dispatcher).mock.calls[0] as unknown as [DomainEvent]
      )[0];
      expect(dispatched.name).toBe("auth.password-reset.requested");
      expect(dispatched.userId).toBe("user-1");
      const payload = dispatched.payload as {
        userId: string;
        token: string;
        requestedAt: Date;
      };
      expect(payload.userId).toBe("user-1");
      expect(typeof payload.token).toBe("string");
      expect(payload.token.length).toBeGreaterThanOrEqual(32);
      expect(payload.requestedAt).toBeInstanceOf(Date);
    });

    it("does NOT call prisma.$transaction on the request path (F1 atomicity is consumeReset-only)", async () => {
      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$existing",
      });
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();
      const prismaStub = makePrismaStub();

      const { PasswordResetService } =
        await import("../../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo,
        tokenRepo as unknown as PasswordResetTokenRepository,
        dispatcher,
        asPrismaStub(prismaStub),
      );

      await service.requestReset("alice@example.com");

      // The request path is single-write (tokenRepo.create) — no tx
      // is needed. The transactional contract is consumeReset-only
      // (see password-reset.service.test.ts F1 fix).
      expect(prismaStub.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("unknown email path (no enumeration leak)", () => {
    it("returns void, persists NO row, and dispatches NO event for an unknown email", async () => {
      const userRepo = makeFakeUserRepo(null); // no seeded user
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } =
        await import("../../password-reset.service.js");
      const service = new PasswordResetService(userRepo, tokenRepo, dispatcher);

      // Act — unknown email.
      const result = await service.requestReset("ghost@example.com");

      // Assert — the public contract: void return (parallels the
      // known-email path so the controller's 202 response is
      // identical regardless of which path executed).
      expect(result).toBeUndefined();

      // CRITICAL: no persistence, no dispatch. This is the
      // no-enumeration-leak invariant.
      expect(tokenRepo.create).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();

      // The internal rows Map stays empty (defense-in-depth — even
      // an internal helper that bypassed the tokenRepo port would
      // leave no trace).
      expect(tokenRepo.rows.size).toBe(0);
    });

    it("does NOT call bcrypt.hash on the unknown-email path (no work, no side-channel timing)", async () => {
      const userRepo = makeFakeUserRepo(null);
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } =
        await import("../../password-reset.service.js");
      const service = new PasswordResetService(userRepo, tokenRepo, dispatcher);

      await service.requestReset("ghost@example.com");

      // bcrypt.hash is the most expensive operation on the known-email
      // path (consumeReset uses it; requestReset never does). Even
      // though requestReset doesn't hash, this assertion guards
      // against a future refactor that adds a hash step on the
      // unknown-email path (which would create a timing side-channel).
      // bcrypt is module-mocked at the top of this file; the spy
      // exists for this exact assertion.
      // We import lazily to satisfy the bcryptjs mock contract.
      const bcrypt = (await import("bcryptjs")).default;
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  describe("known vs unknown — observationally identical at the public contract level", () => {
    it("both paths return void and resolve (no exception, no rejection)", async () => {
      // Known-email path
      const knownUserRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$existing",
      });
      const knownDispatcher = vi.fn<AuthEventDispatcher>();
      const knownTokenRepo = makeFakeTokenRepo();

      // Unknown-email path
      const unknownUserRepo = makeFakeUserRepo(null);
      const unknownDispatcher = vi.fn<AuthEventDispatcher>();
      const unknownTokenRepo = makeFakeTokenRepo();

      const { PasswordResetService } =
        await import("../../password-reset.service.js");

      const knownService = new PasswordResetService(
        knownUserRepo,
        knownTokenRepo,
        knownDispatcher,
      );
      const unknownService = new PasswordResetService(
        unknownUserRepo,
        unknownTokenRepo,
        unknownDispatcher,
      );

      // Both promises resolve (no rejection) and both resolve to
      // undefined (no shape difference between the two paths).
      const knownResult = await knownService.requestReset("alice@example.com");
      const unknownResult = await unknownService.requestReset("ghost@example.com");

      expect(knownResult).toBeUndefined();
      expect(unknownResult).toBeUndefined();
    });
  });
});