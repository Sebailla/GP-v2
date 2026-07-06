import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for PasswordResetService — slice 3 (batches 4 + 5).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.1
 * (`PasswordResetService` — `requestReset(email)` mints a single-use token
 * and dispatches `auth.password-reset.requested`; `consumeReset(token,
 * newPassword)` validates the token, replaces the user's `passwordHash`,
 * marks the token `consumedAt = now`, and dispatches
 * `auth.password-reset.completed`) and the auth spec's "Password Reset
 * (Forgot + Reset, Email Mocked)" requirement.
 *
 * Security invariants pinned by these tests:
 *  - Email enumeration is prevented: the `requestReset(unknownEmail)` path
 *    returns silently — no event, no token row, no observable side effect.
 *  - Raw tokens are NEVER persisted — only `tokenHash = sha256(token)`.
 *  - Tokens are single-use — a consumed token cannot reset again.
 *  - Expired tokens (>1h) are rejected as the same generic failure as a
 *    non-existent / consumed token (no side-channel "this one expired" leak).
 *  - `consumeReset` replaces the user's `passwordHash` by calling the bcrypt
 *    hash and wrapping both writes in a `prisma.$transaction` callback
 *    (cost factor `BCRYPT_COST_FACTOR = 10` per design §4.1).
 *  - The dispatcher is REQUIRED; the constructor throws `TypeError` when
 *    the dispatcher argument is not a function.
 *  - F2: when the dispatcher rejects AFTER the transaction commits, the
 *    service resolves normally and emits a structured `AuditSink` signal.
 *
 * Phase 2 refactor (slice 3 batch 5):
 *  - Imports the shared `password-reset.fakes.ts` factories (R2 #6).
 *  - Imports `PasswordResetTokenRecord` from the GREEN-state port (R2 #2).
 *  - Drops the unused `vi.mock("@core/database", ...)` block (R4 #3).
 *  - Switches `vi.clearAllMocks()` to `vi.resetAllMocks()` (R4 #2).
 *  - Refactors 3 failure-mode tests through `runInvalidTokenScenario`
 *    (R2 #3).
 *  - Replaces try/catch with `await expect(...).rejects.toBeInstanceOf` /
 *    `rejects.toThrow` (R4 #5).
 *
 * bcryptjs is mocked (the service hashes the new password inline); the
 * Prisma singleton is NOT mocked at the top level — per-test
 * `makePrismaStub()` injects a minimal tx-shaped stub via the 4th
 * constructor arg.
 */

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import type { PrismaClient } from "@core/database";
import type { DomainEvent } from "@core/events";
import bcrypt from "bcryptjs";

import type { AuthEventDispatcher } from "../events.js";
import { BCRYPT_COST_FACTOR } from "../constants.js";
import { MIN_TOKEN_LENGTH } from "../password-reset.service.js";

/**
 * Token TTL asserted by these tests (1h per design §4.1). Named here
 * rather than imported from the service so the tests pin the
 * contract explicitly: the service MUST use this exact TTL.
 */
const TEST_TOKEN_TTL_MS = 60 * 60 * 1000;
import type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from "../domain/interfaces/password-reset-token.repository.js";
import {
  makeFakeTokenRepo,
  makeFakeUserRepo,
  makePrismaStub,
  sha256,
  seedTokenRow,
  type FakePrismaStub,
  type FakeTokenRepo,
} from "./fixtures/password-reset.fakes.js";

/**
 * Construct a Prisma-shaped stub for the 4th constructor arg of
 * `PasswordResetService`. The real `PrismaClient` type has many
 * surface methods (`$on`, `$connect`, ...) that the service never
 * uses; the fake is intentionally narrow. The `as unknown as` cast
 * is narrowly scoped (only the Prisma constructor slot); the
 * UserRepository + PasswordResetTokenRepository ports use the REAL
 * types (R2 #2 — the brief's intent).
 */
function asPrismaStub(stub: FakePrismaStub): PrismaClient {
  return stub as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Shared failure-mode scenario helper (R2 #3).
//
// Each invalid-token test scenario pins a different seed row state
// (consumed / expired / unknown) and asserts the same generic
// `AuthError('INVALID_RESET_TOKEN')` copy is thrown — with the
// forbid-word assertion confirming the error message does NOT
// leak the specific failure mode.
//
// Every scenario also asserts the same negative post-conditions:
// no `$transaction` was invoked, no `updatePassword` was called,
// no `completed` event was dispatched, and `bcrypt.hash` was
// never called (the service short-circuits BEFORE any of these).
// ---------------------------------------------------------------------------

interface InvalidTokenScenario {
  rawToken: string;
  seedRow?: Partial<PasswordResetTokenRecord> | null;
  forbidMessageWord: string; // word that MUST NOT appear in the error message
  rawTokenIsInTokenRepo: boolean; // false → empty tokenRepo (unknown-token path)
}

async function runInvalidTokenScenario(scenario: InvalidTokenScenario) {
  const { rawToken, seedRow, forbidMessageWord, rawTokenIsInTokenRepo } =
    scenario;

  const tokenRepo = makeFakeTokenRepo();
  if (rawTokenIsInTokenRepo) {
    seedTokenRow(tokenRepo, rawToken, {
      id: seedRow?.id ?? "prt-x",
      userId: seedRow?.userId ?? "user-1",
      expiresAt: seedRow?.expiresAt ?? new Date(Date.now() + TEST_TOKEN_TTL_MS),
      consumedAt: seedRow?.consumedAt ?? null,
    });
  }

  const userRepo = makeFakeUserRepo({
    id: "user-1",
    email: "alice@example.com",
    role: "USER",
    hashedPassword: "$2a$10$old",
  });
  const dispatcher = vi.fn<AuthEventDispatcher>();
  const prismaStub = makePrismaStub();
  const auditSink = vi.fn();

  const { PasswordResetService, AuthError } =
    await import("../password-reset.service.js");
  const service = new PasswordResetService(
    userRepo,
    tokenRepo as unknown as PasswordResetTokenRepository,
    dispatcher,
    asPrismaStub(prismaStub),
    auditSink,
  );

  // The contract: throws AuthError(INVALID_RESET_TOKEN) with generic
  // copy that does NOT contain the forbidMessageWord. ONE call, asserted
  // via `.rejects.toSatisfy(predicate)` — preserves the production
  // path invocations while folding the instance + code + message checks
  // into a single matcher (the previous shape called
  // `service.consumeReset(...)` twice per scenario: once for the
  // instance assertion, once for the message-shape assertion).
  await expect(
    service.consumeReset(rawToken, "anotherPassword"),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof AuthError &&
      err.code === "INVALID_RESET_TOKEN" &&
      !err.message.toLowerCase().includes(forbidMessageWord),
  );

  // Negative post-conditions shared by every invalid-token path.
  expect(userRepo.updatePassword).not.toHaveBeenCalled();
  expect(dispatcher).not.toHaveBeenCalled();
  expect(prismaStub.$transaction).not.toHaveBeenCalled();
  expect(bcrypt.hash).not.toHaveBeenCalled();
}

describe("PasswordResetService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // F8 (WARNING) — the constructor MUST throw TypeError eagerly when the
  // dispatcher is not a function.
  // -------------------------------------------------------------------------
  it("F8 — the constructor throws TypeError when the dispatcher is missing/null (not a function)", async () => {
    const { PasswordResetService } =
      await import("../password-reset.service.js");
    const userRepo = makeFakeUserRepo(null);
    const tokenRepo = makeFakeTokenRepo();
    const prismaStub = makePrismaStub();
    const auditSink = vi.fn();

    expect(
      () =>
        new PasswordResetService(
          userRepo,
          tokenRepo,
          null as unknown as AuthEventDispatcher,
          asPrismaStub(prismaStub),
          auditSink,
        ),
    ).toThrow(TypeError);

    expect(
      () =>
        new PasswordResetService(
          userRepo,
          tokenRepo,
          undefined as unknown as AuthEventDispatcher,
          asPrismaStub(prismaStub),
          auditSink,
        ),
    ).toThrow(TypeError);
  });

  describe("requestReset", () => {
    it("mints a token, persists a row, and dispatches auth.password-reset.requested for a known email", async () => {
      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old-hash",
      });
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(userRepo, tokenRepo, dispatcher);

      await service.requestReset("alice@example.com");

      expect(tokenRepo.create).toHaveBeenCalledTimes(1);
      const createdArg = (
        vi.mocked(tokenRepo.create).mock.calls[0] as unknown as [
          { userId: string; tokenHash: string; expiresAt: Date },
        ]
      )[0];
      expect(createdArg.userId).toBe("user-1");
      expect(createdArg.expiresAt.getTime()).toBeGreaterThan(Date.now());
      const expectedExpiry = Date.now() + TEST_TOKEN_TTL_MS;
      expect(
        Math.abs(createdArg.expiresAt.getTime() - expectedExpiry),
      ).toBeLessThan(5_000);

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
      expect(payload.token.length).toBeGreaterThanOrEqual(MIN_TOKEN_LENGTH);
      expect(sha256(payload.token)).toBe(createdArg.tokenHash);
      expect(payload.requestedAt).toBeInstanceOf(Date);
    });

    it("returns silently for an unknown email — NO event, NO row (no enumeration leak)", async () => {
      const userRepo = makeFakeUserRepo(null);
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(userRepo, tokenRepo, dispatcher);

      await expect(
        service.requestReset("ghost@example.com"),
      ).resolves.toBeUndefined();

      expect(tokenRepo.create).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();
    });

    it("mints TWO distinct tokens when called twice for the same email (single-use semantics)", async () => {
      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old-hash",
      });
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(userRepo, tokenRepo, dispatcher);

      await service.requestReset("alice@example.com");
      await service.requestReset("alice@example.com");

      expect(tokenRepo.create).toHaveBeenCalledTimes(2);
      const first = (
        vi.mocked(tokenRepo.create).mock.calls[0] as unknown as [
          { tokenHash: string },
        ]
      )[0].tokenHash;
      const second = (
        vi.mocked(tokenRepo.create).mock.calls[1] as unknown as [
          { tokenHash: string },
        ]
      )[0].tokenHash;
      expect(first).not.toBe(second);

      expect(dispatcher).toHaveBeenCalledTimes(2);
      const events = vi
        .mocked(dispatcher)
        .mock.calls.map((c) => (c as unknown as [DomainEvent])[0]);
      expect(
        events.every((e) => e.name === "auth.password-reset.requested"),
      ).toBe(true);
    });
  });

  describe("consumeReset — prisma.$transaction atomicity (F1 + F6)", () => {
    it("wraps userRepo.updatePassword + tokenRepo.markConsumed in a prisma.$transaction so a 2nd-write failure rolls back the first (F1 + F6)", async () => {
      const rawToken = "a".repeat(48);
      const tokenRepo: FakeTokenRepo = makeFakeTokenRepo();
      seedTokenRow(tokenRepo, rawToken, { id: "prt-1", userId: "user-1" });

      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old",
      });

      const dispatcher = vi.fn<AuthEventDispatcher>();
      vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new-hash" as never);

      const txUserUpdate = vi.fn(async () => undefined);
      const txPasswordResetTokenUpdate = vi.fn(async () => {
        throw new Error("simulated deadlock on the second write");
      });
      const prismaStub = makePrismaStub({
        txUserUpdate,
        txPrtUpdate: txPasswordResetTokenUpdate,
      });

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo,
        tokenRepo as unknown as PasswordResetTokenRepository,
        dispatcher,
        asPrismaStub(prismaStub),
      );

      await expect(service.consumeReset(rawToken, "newPwd123")).rejects.toThrow(
        /simulated deadlock/i,
      );

      expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
      expect(txUserUpdate).toHaveBeenCalledTimes(1);
      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { hashedPassword: "$2a$10$new-hash" },
      });
      expect(txPasswordResetTokenUpdate).toHaveBeenCalledTimes(1);
      const prtCall = (
        vi.mocked(txPasswordResetTokenUpdate).mock.calls[0] as unknown as [
          { where: { tokenHash: string }; data: { consumedAt: Date } },
        ]
      )[0];
      expect(prtCall.where).toEqual({ tokenHash: sha256(rawToken) });
      expect(prtCall.data.consumedAt).toBeInstanceOf(Date);

      expect(userRepo.updatePassword).not.toHaveBeenCalled();
      expect(tokenRepo.markConsumed).not.toHaveBeenCalled();
    });
  });

  describe("consumeReset — dispatcher-failure handling (F2 + F12)", () => {
    it("does NOT reject if the post-commit dispatcher rejects; emits a structured AuditSink signal (F2)", async () => {
      const rawToken = "a".repeat(48);
      const tokenRepo = makeFakeTokenRepo();
      seedTokenRow(tokenRepo, rawToken, { id: "prt-1", userId: "user-1" });

      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old",
      });

      const dispatcherError = new Error("email service down");
      const dispatcher = vi
        .fn<AuthEventDispatcher>()
        .mockRejectedValue(dispatcherError);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new-hash" as never);

      const prismaStub = makePrismaStub();
      const auditSink = vi.fn();

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo,
        tokenRepo as unknown as PasswordResetTokenRepository,
        dispatcher,
        asPrismaStub(prismaStub),
        auditSink,
      );

      await expect(
        service.consumeReset(rawToken, "newPwd123"),
      ).resolves.toBeUndefined();

      expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaStub.txUserUpdate).toHaveBeenCalledTimes(1);
      expect(prismaStub.txPrtUpdate).toHaveBeenCalledTimes(1);
      expect(dispatcher).toHaveBeenCalledTimes(1);

      expect(auditSink).toHaveBeenCalledTimes(1);
      const signal = (
        vi.mocked(auditSink).mock.calls[0] as unknown as [
          {
            kind: string;
            event: { name?: string };
            error?: unknown;
          },
        ]
      )[0];
      expect(signal.kind).toBe("AUTH_EVENT_DISPATCH_FAILURE");
      expect(signal.event?.name).toBe("auth.password-reset.completed");
      expect((signal.error as Error).message).toMatch(/email service down/i);
    });

    it("does NOT call AuditSink when the dispatcher resolves (F2 — only failure path triggers the signal)", async () => {
      const rawToken = "a".repeat(48);
      const tokenRepo = makeFakeTokenRepo();
      seedTokenRow(tokenRepo, rawToken, { id: "prt-1", userId: "user-1" });
      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old",
      });
      const dispatcher = vi.fn<AuthEventDispatcher>();
      vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new-hash" as never);
      const prismaStub = makePrismaStub();
      const auditSink = vi.fn();

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo,
        tokenRepo as unknown as PasswordResetTokenRepository,
        dispatcher,
        asPrismaStub(prismaStub),
        auditSink,
      );

      await expect(
        service.consumeReset(rawToken, "newPwd123"),
      ).resolves.toBeUndefined();

      expect(auditSink).not.toHaveBeenCalled();
    });
  });

  describe("consumeReset — failure-mode scenarios (R2 #3 — shared helper)", () => {
    it("with an already-consumed token — throws AuthError generic; no 'consumed' wording", async () => {
      const rawToken = "b".repeat(48);
      await runInvalidTokenScenario({
        rawToken,
        rawTokenIsInTokenRepo: true,
        seedRow: {
          id: "prt-2",
          userId: "user-1",
          expiresAt: new Date(Date.now() + TEST_TOKEN_TTL_MS),
          consumedAt: new Date(Date.now() - 1_000),
        },
        forbidMessageWord: "consumed",
      });
    });

    it("with an expired token (>1h ago) — throws AuthError generic; no 'expired' wording", async () => {
      const rawToken = "c".repeat(48);
      await runInvalidTokenScenario({
        rawToken,
        rawTokenIsInTokenRepo: true,
        seedRow: {
          id: "prt-3",
          userId: "user-1",
          expiresAt: new Date(Date.now() - 1_000),
          consumedAt: null,
        },
        forbidMessageWord: "expired",
      });
    });

    it("with an unknown token — throws AuthError generic; NO 'not found' wording (no enumeration leak)", async () => {
      await runInvalidTokenScenario({
        rawToken: "unknown-token-string-of-sufficient-length-1234567890",
        rawTokenIsInTokenRepo: false,
        seedRow: null,
        forbidMessageWord: "not found",
      });
    });
  });

  describe("consumeReset — happy path (F1 tx + F2 dispatch)", () => {
    it("with a valid token — replaces passwordHash (bcrypt 10), marks consumed inside tx, dispatches auth.password-reset.completed", async () => {
      const rawToken = "a".repeat(48);
      const tokenRepo = makeFakeTokenRepo();
      seedTokenRow(tokenRepo, rawToken, { id: "prt-1", userId: "user-1" });

      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old-hash",
      });
      const dispatcher = vi.fn<AuthEventDispatcher>();
      vi.mocked(bcrypt.hash).mockResolvedValue(
        "$2a$10$new-bcrypt-hash" as never,
      );
      const prismaStub = makePrismaStub();

      const { PasswordResetService } =
        await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo,
        tokenRepo as unknown as PasswordResetTokenRepository,
        dispatcher,
        asPrismaStub(prismaStub),
      );

      await service.consumeReset(rawToken, "newPassword123");

      expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaStub.txUserUpdate).toHaveBeenCalledTimes(1);
      expect(prismaStub.txUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { hashedPassword: "$2a$10$new-bcrypt-hash" },
      });
      expect(prismaStub.txPrtUpdate).toHaveBeenCalledTimes(1);
      const prtUpdateArg = (
        vi.mocked(prismaStub.txPrtUpdate).mock.calls[0] as unknown as [
          { where: { tokenHash: string }; data: { consumedAt: Date } },
        ]
      )[0];
      expect(prtUpdateArg.where).toEqual({ tokenHash: sha256(rawToken) });
      expect(prtUpdateArg.data.consumedAt).toBeInstanceOf(Date);

      expect(userRepo.updatePassword).not.toHaveBeenCalled();
      expect(tokenRepo.markConsumed).not.toHaveBeenCalled();

      expect(dispatcher).toHaveBeenCalledTimes(1);
      const dispatched = (
        vi.mocked(dispatcher).mock.calls[0] as unknown as [DomainEvent]
      )[0];
      expect(dispatched.name).toBe("auth.password-reset.completed");
      expect(dispatched.userId).toBe("user-1");
      const payload = dispatched.payload as {
        userId: string;
        resetAt: Date;
      };
      expect(payload.userId).toBe("user-1");
      expect(payload.resetAt).toBeInstanceOf(Date);

      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
      expect(bcrypt.hash).toHaveBeenCalledWith(
        "newPassword123",
        BCRYPT_COST_FACTOR,
      );
    });
  });
});
