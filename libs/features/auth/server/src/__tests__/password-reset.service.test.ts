import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * TDD contract for PasswordResetService (slice 3 batch 4 / brief T3.4 RED).
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
 *  - `consumeReset` replaces the user's `passwordHash` by calling
 *    `userRepo.updatePassword(userId, await bcrypt.hash(newPassword, 10))`
 *    (cost factor 10 per design §4.1). The GREEN commit extends the
 *    `UserRepository` port with `updatePassword(userId, hashedPassword)`.
 *
 * Pattern A is adopted for event dispatch (canonical design §4.1): the
 * service is constructed with the dispatcher in its constructor; the
 * service dispatches directly. `wireAuthEvents` (slice 3 batch 3) does
 * NOT know about `PasswordResetService`.
 *
 * Public contract pinned by these tests:
 *  - `requestReset(email): Promise<void>`
 *      - known email → mints a token, persists the row, dispatches
 *        `auth.password-reset.requested` exactly once with payload
 *        `{ userId, token, requestedAt }` (token is RAW — picked up by
 *        the dev mailbox ring buffer in slice 4).
 *      - unknown email → returns silently (idempotent / no enumeration).
 *      - same email twice → TWO distinct tokens (different `tokenHash`).
 *  - `consumeReset(rawToken, newPassword): Promise<void>`
 *      - valid token → `userRepo.updatePassword(userId, bcrypt10hash)`,
 *        `passwordResetTokenRepo.markConsumed(tokenHash, now)`, dispatches
 *        `auth.password-reset.completed` with `{ userId, resetAt }`.
 *      - consumed token → throws AuthError('INVALID_RESET_TOKEN') generic;
 *        no password update, no `completed` event.
 *      - expired token → throws AuthError('INVALID_RESET_TOKEN') generic;
 *        no password update.
 *      - unknown token → throws AuthError('INVALID_RESET_TOKEN') generic;
 *        no "not found" wording (no enumeration side-channel).
 *
 * RED state: password-reset.service.ts does NOT exist yet. The dynamic
 * import inside each `it` block throws ERR_MODULE_NOT_FOUND. Every test
 * fails for the expected "feature missing" reason.
 *
 * bcryptjs is mocked to keep the suite deterministic (no real hashing
 * cost). The Prisma singleton is mocked — but PasswordResetService uses
 * the `UserRepository` / `PasswordResetTokenRepository` ports, NOT
 * `prisma.*` directly. The mocks here are fakes-of-ports (in-memory
 * implementations), not Prisma spies.
 *
 * The `PasswordResetTokenRepository` port + `PasswordResetTokenRecord`
 * type are declared in the same GREEN commit. The test file references
 * their shape through a structural type alias (`FakePasswordResetToken
 * Repository` / `PasswordResetTokenRecord`) so this RED file compiles
 * without the GREEN-only declarations.
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import type { DomainEvent } from "@core/events";
import bcrypt from "bcryptjs";

import type { AuthEventDispatcher } from "../events.js";

// ---------------------------------------------------------------------------
// Local structural types (RED-state stand-ins for the GREEN-state port).
// The GREEN commit declares `PasswordResetTokenRepository` +
// `PasswordResetTokenRecord` in `src/domain/interfaces/password-reset-token
// .repository.ts`. Until that commit lands, the tests reference these
// shapes via this inline structural alias so the file compiles AND fails
// only on the missing service module.
// ---------------------------------------------------------------------------

interface PasswordResetTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

// The `FakePasswordResetTokenRepository` interface is the structural
// stand-in for the GREEN-state `PasswordResetTokenRepository` port. The
// `makeFakeTokenRepo()` factory below returns an object that satisfies
// this shape — `tokenRepo as never` casts in the tests are how the
// service picks it up.
interface FakePasswordResetTokenRepository {
  create(args: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord>;
  findByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  markConsumed(tokenHash: string, consumedAt: Date): Promise<void>;
}

interface FakeUserRepository {
  findByEmail: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  updatePassword: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// In-memory fakes for the seam (UserRepository + PasswordResetTokenRepository).
// ---------------------------------------------------------------------------

function makeFakeUserRepo(user: {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  hashedPassword: string | null;
} | null): FakeUserRepository {
  const updatePassword = vi.fn(async (_userId: string, _hashed: string) => {});
  return {
    findByEmail: vi.fn(async (email: string) => {
      if (user === null || user.email !== email) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        hashedPassword: user.hashedPassword,
      };
    }),
    findById: vi.fn(async (id: string) => {
      if (user === null || user.id !== id) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        hashedPassword: user.hashedPassword,
      };
    }),
    updatePassword,
  };
}

    function makeFakeTokenRepo() {
      const rows = new Map<string, PasswordResetTokenRecord>();
      return {
        rows,
        create: vi.fn(async (args: {
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        }) => {
          const row: PasswordResetTokenRecord = {
            id: `prt-${rows.size + 1}`,
            userId: args.userId,
            tokenHash: args.tokenHash,
            expiresAt: args.expiresAt,
            consumedAt: null,
          };
          rows.set(args.tokenHash, row);
          return row;
        }),
        findByHash: vi.fn(async (tokenHash: string) => {
          return rows.get(tokenHash) ?? null;
        }),
        markConsumed: vi.fn(async (tokenHash: string, consumedAt: Date) => {
          const row = rows.get(tokenHash);
          if (row === undefined) return;
          rows.set(tokenHash, { ...row, consumedAt });
        }),
      };
    }

    /**
     * Build a Prisma stub that exposes `$transaction` for F1 (the
     * service writes through `tx.user.update` / `tx.passwordResetToken
     * .update`, NOT through the UserRepository / PasswordResetToken
     * Repository ports). The returned stub records both tx-level calls
     * and exposes them for assertion via `prismaStub.txUserUpdate` /
     * `prismaStub.txPrtUpdate`. Default: both updates succeed
     * (returning `undefined`). Inject custom `txUserUpdate` /
     * `txPrtUpdate` to simulate failures.
     */
    function makePrismaStub(
      options?: {
        txUserUpdate?: ReturnType<typeof vi.fn>;
        txPrtUpdate?: ReturnType<typeof vi.fn>;
      },
    ): {
      $transaction: ReturnType<typeof vi.fn>;
      txUserUpdate: ReturnType<typeof vi.fn>;
      txPrtUpdate: ReturnType<typeof vi.fn>;
    } {
      const txUserUpdate =
        options?.txUserUpdate ??
        vi.fn(async () => undefined);
      const txPrtUpdate =
        options?.txPrtUpdate ??
        vi.fn(async () => undefined);
      const $transaction = vi.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            user: { update: txUserUpdate },
            passwordResetToken: { update: txPrtUpdate },
          });
        },
      );
      return { $transaction, txUserUpdate, txPrtUpdate };
    }

const sha256 = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

describe("PasswordResetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      const { PasswordResetService } = await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo as never,
        tokenRepo as never,
        dispatcher,
      );

      await service.requestReset("alice@example.com");

      // 1. Exactly one token row persisted, with sha256(rawToken) stored (NEVER the raw token).
      expect(tokenRepo.create).toHaveBeenCalledTimes(1);
      const createdArg = (vi.mocked(tokenRepo.create).mock.calls[0] as unknown as [
        { userId: string; tokenHash: string; expiresAt: Date },
      ])[0];
      expect(createdArg.userId).toBe("user-1");
      // expiresAt ≈ now + 1h (within tolerance for test execution time).
      expect(createdArg.expiresAt.getTime()).toBeGreaterThan(Date.now());
      const expectedExpiry = Date.now() + 60 * 60 * 1000;
      expect(
        Math.abs(createdArg.expiresAt.getTime() - expectedExpiry),
      ).toBeLessThan(5_000);

      // 2. Exactly ONE auth.password-reset.requested dispatched.
      expect(dispatcher).toHaveBeenCalledTimes(1);
      const dispatched = (vi.mocked(dispatcher).mock.calls[0] as unknown as [
        DomainEvent,
      ])[0];
      expect(dispatched.name).toBe("auth.password-reset.requested");
      expect(dispatched.userId).toBe("user-1");
      const payload = dispatched.payload as {
        userId: string;
        token: string;
        requestedAt: Date;
      };
      expect(payload.userId).toBe("user-1");
      expect(payload.token.length).toBeGreaterThanOrEqual(32);
      // The dispatched token must hash to the persisted tokenHash (single source of truth).
      expect(sha256(payload.token)).toBe(createdArg.tokenHash);
      expect(payload.requestedAt).toBeInstanceOf(Date);
    });

    it("returns silently for an unknown email — NO event, NO row (no enumeration leak)", async () => {
      const userRepo = makeFakeUserRepo(null);
      const tokenRepo = makeFakeTokenRepo();
      const dispatcher = vi.fn<AuthEventDispatcher>();

      const { PasswordResetService } = await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo as never,
        tokenRepo as never,
        dispatcher,
      );

      await expect(
        service.requestReset("ghost@example.com"),
      ).resolves.toBeUndefined();

      // No token created.
      expect(tokenRepo.create).not.toHaveBeenCalled();
      // No event dispatched.
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

      const { PasswordResetService } = await import("../password-reset.service.js");
      const service = new PasswordResetService(
        userRepo as never,
        tokenRepo as never,
        dispatcher,
      );

      await service.requestReset("alice@example.com");
      await service.requestReset("alice@example.com");

      expect(tokenRepo.create).toHaveBeenCalledTimes(2);
      const first = ((vi.mocked(tokenRepo.create).mock.calls[0] as unknown) as [
        { tokenHash: string },
      ])[0].tokenHash;
      const second = ((vi.mocked(tokenRepo.create).mock.calls[1] as unknown) as [
        { tokenHash: string },
      ])[0].tokenHash;
      expect(first).not.toBe(second);

      // Both events dispatched.
      expect(dispatcher).toHaveBeenCalledTimes(2);
      const events = vi.mocked(dispatcher).mock.calls.map(
        (c) => (c as unknown as [DomainEvent])[0],
      );
      expect(events.every((e) => e.name === "auth.password-reset.requested")).toBe(
        true,
      );
    });
  });

      describe("consumeReset — prisma.$transaction atomicity (F1 + F6)", () => {
        it("wraps userRepo.updatePassword + tokenRepo.markConsumed in a prisma.$transaction so a 2nd-write failure rolls back the first (F1 + F6)", async () => {
          // 1. Seed a valid token.
          const rawToken = "a".repeat(48);
          const tokenHash = sha256(rawToken);
          const tokenRepo = makeFakeTokenRepo();
          tokenRepo.rows.set(tokenHash, {
            id: "prt-1",
            userId: "user-1",
            tokenHash,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            consumedAt: null,
          });

          // 2. userRepo / tokenRepo port spies — should NOT be called inside the transaction (the
          //    brief's Path A routes the writes through `tx.*` directly so the transaction owns
          //    the connection).
          const userRepo = makeFakeUserRepo({
            id: "user-1",
            email: "alice@example.com",
            role: "USER",
            hashedPassword: "$2a$10$old",
          });

          const dispatcher = vi.fn<AuthEventDispatcher>();
          vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new-hash" as never);

          // 3. Prisma stub: $transaction invokes the cb with a tx whose `user.update`
          //    succeeds but whose `passwordResetToken.update` throws — proves the
          //    transaction wraps both writes (and would roll the first back in a real DB).
          const txUserUpdate = vi.fn(async () => undefined);
          const txPasswordResetTokenUpdate = vi.fn(async () => {
            throw new Error("simulated deadlock on the second write");
          });
          const $transaction = vi.fn(
            async (cb: (tx: unknown) => Promise<unknown>) => {
              return cb({
                user: { update: txUserUpdate },
                passwordResetToken: { update: txPasswordResetTokenUpdate },
              });
            },
          );
          const prismaStub = { $transaction };

          const { PasswordResetService } = await import(
            "../password-reset.service.js"
          );
          const service = new PasswordResetService(
            userRepo as never,
            tokenRepo as never,
            dispatcher,
            prismaStub as never, // F1: 4th constructor arg — currently IGNORED in RED state.
          );

          // 4. consumeReset must reject (the transaction callback threw).
          await expect(
            service.consumeReset(rawToken, "newPwd123"),
          ).rejects.toThrow(/simulated deadlock/i);

          // 5. $transaction was called exactly once — proves the service routes
          //    both writes through ONE transaction (not bare await calls).
          expect($transaction).toHaveBeenCalledTimes(1);

          // 6. Inside the tx: user.update was called with the hashed password.
          expect(txUserUpdate).toHaveBeenCalledTimes(1);
          expect(txUserUpdate).toHaveBeenCalledWith({
            where: { id: "user-1" },
            data: { hashedPassword: "$2a$10$new-hash" },
          });

          // 7. Inside the tx: passwordResetToken.update was called with consumedAt.
          expect(txPasswordResetTokenUpdate).toHaveBeenCalledTimes(1);
          const prtCall = (
            vi.mocked(txPasswordResetTokenUpdate).mock.calls[0] as unknown as [
              { where: { tokenHash: string }; data: { consumedAt: Date } },
            ]
          )[0];
          expect(prtCall.where).toEqual({ tokenHash });
          expect(prtCall.data.consumedAt).toBeInstanceOf(Date);

          // 8. The port-level updatePassword / markConsumed were NOT called —
          //    the transaction owns the writes (Path A). This proves the
          //    service doesn't double-write (which would break atomicity).
          expect(userRepo.updatePassword).not.toHaveBeenCalled();
          expect(tokenRepo.markConsumed).not.toHaveBeenCalled();
        });
      });

      describe("consumeReset", () => {
        it("with a valid token — replaces passwordHash (bcrypt 10), marks consumed, dispatches auth.password-reset.completed", async () => {
          // 1. Seed a valid token via the in-memory token repo.
          const rawToken = "a".repeat(48); // 48 chars, satisfies >=32
          const tokenHash = sha256(rawToken);
          const tokenRepo = makeFakeTokenRepo();
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
          tokenRepo.rows.set(tokenHash, {
            id: "prt-1",
            userId: "user-1",
            tokenHash,
            expiresAt,
            consumedAt: null,
          });

          // 2. Wire userRepo with updatePassword spy.
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

          // F1: both writes go through `tx.*` inside `prisma.$transaction`.
          const prismaStub = makePrismaStub();

          const { PasswordResetService } = await import("../password-reset.service.js");
          const service = new PasswordResetService(
            userRepo as never,
            tokenRepo as never,
            dispatcher,
            prismaStub as never,
          );

          await service.consumeReset(rawToken, "newPassword123");

          // F1: $transaction was called once with BOTH writes inside.
          expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
          // tx.user.update called with (userId, hashedPassword) — the bcrypt
          // cost factor is visible at this seam.
          expect(prismaStub.txUserUpdate).toHaveBeenCalledTimes(1);
          expect(prismaStub.txUserUpdate).toHaveBeenCalledWith({
            where: { id: "user-1" },
            data: { hashedPassword: "$2a$10$new-bcrypt-hash" },
          });
          // tx.passwordResetToken.update called with (tokenHash, consumedAt).
          expect(prismaStub.txPrtUpdate).toHaveBeenCalledTimes(1);
          const prtUpdateArg = (
            vi.mocked(prismaStub.txPrtUpdate).mock
              .calls[0] as unknown as [
              { where: { tokenHash: string }; data: { consumedAt: Date } },
            ]
          )[0];
          expect(prtUpdateArg.where).toEqual({ tokenHash });
          expect(prtUpdateArg.data.consumedAt).toBeInstanceOf(Date);

          // The port-level updatePassword + markConsumed are NEVER called
          // (the transaction owns the writes; double-writing would defeat
          // atomicity).
          expect(userRepo.updatePassword).not.toHaveBeenCalled();
          expect(tokenRepo.markConsumed).not.toHaveBeenCalled();

          // auth.password-reset.completed dispatched once with the right shape.
          expect(dispatcher).toHaveBeenCalledTimes(1);
          const dispatched = (vi.mocked(dispatcher).mock.calls[0] as unknown as [
            DomainEvent,
          ])[0];
          expect(dispatched.name).toBe("auth.password-reset.completed");
          expect(dispatched.userId).toBe("user-1");
          const payload = dispatched.payload as {
            userId: string;
            resetAt: Date;
          };
          expect(payload.userId).toBe("user-1");
          expect(payload.resetAt).toBeInstanceOf(Date);

          // bcrypt.hash called with the new password and cost factor 10.
          // Asserting the exact `bcrypt.hash(newPassword, 10)` shape avoids
          // the `'hash, 10'` literal-string flakiness flagged in the brief.
          expect(bcrypt.hash).toHaveBeenCalledTimes(1);
          expect(bcrypt.hash).toHaveBeenCalledWith("newPassword123", 10);
        });

    it("with an already-consumed token — throws AuthError generic; no password update; no completed event", async () => {
      const rawToken = "b".repeat(48);
      const tokenHash = sha256(rawToken);
      const tokenRepo = makeFakeTokenRepo();
      tokenRepo.rows.set(tokenHash, {
        id: "prt-2",
        userId: "user-1",
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: new Date(Date.now() - 1_000), // already consumed
      });

      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old",
      });
      const dispatcher = vi.fn<AuthEventDispatcher>();
      vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new" as never);

      const prismaStub = makePrismaStub();
      const { PasswordResetService, AuthError } = await import(
        "../password-reset.service.js"
      );
      const service = new PasswordResetService(
        userRepo as never,
        tokenRepo as never,
        dispatcher,
        prismaStub as never,
      );

      let caught: unknown;
      try {
        await service.consumeReset(rawToken, "anotherPassword");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect(
        (caught as InstanceType<typeof AuthError>).code,
      ).toBe("INVALID_RESET_TOKEN");
      // The generic copy should NOT mention "consumed" or "already used".
      expect(
        (caught as InstanceType<typeof AuthError>).message.toLowerCase(),
      ).not.toContain("consumed");
      expect(
        (caught as InstanceType<typeof AuthError>).message.toLowerCase(),
      ).not.toContain("already");
      // No password update, no event.
      expect(userRepo.updatePassword).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();
      // bcrypt.hash never called (short-circuit before user mutation).
      expect(bcrypt.hash).not.toHaveBeenCalled();
      // F1: $transaction was NOT reached (service threw before the
      // transaction wrapper).
      expect(prismaStub.$transaction).not.toHaveBeenCalled();
    });

    it("with an expired token (>1h ago) — throws AuthError generic; no password update; no enumeration leak about expiry", async () => {
      const rawToken = "c".repeat(48);
      const tokenHash = sha256(rawToken);
      const tokenRepo = makeFakeTokenRepo();
      tokenRepo.rows.set(tokenHash, {
        id: "prt-3",
        userId: "user-1",
        tokenHash,
        expiresAt: new Date(Date.now() - 1_000), // expired 1s ago
        consumedAt: null,
      });

      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old",
      });
      const dispatcher = vi.fn<AuthEventDispatcher>();
      const prismaStub = makePrismaStub();

      const { PasswordResetService, AuthError } = await import(
        "../password-reset.service.js"
      );
      const service = new PasswordResetService(
        userRepo as never,
        tokenRepo as never,
        dispatcher,
        prismaStub as never,
      );

      let caught: unknown;
      try {
        await service.consumeReset(rawToken, "anotherPassword");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect(
        (caught as InstanceType<typeof AuthError>).code,
      ).toBe("INVALID_RESET_TOKEN");
      expect(
        (caught as InstanceType<typeof AuthError>).message.toLowerCase(),
      ).not.toContain("expired");
      expect(userRepo.updatePassword).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();
      expect(prismaStub.$transaction).not.toHaveBeenCalled();
    });

    it("with an unknown token — throws AuthError generic; no password update; NO 'not found' wording (no enumeration leak)", async () => {
      const tokenRepo = makeFakeTokenRepo(); // empty
      const userRepo = makeFakeUserRepo({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$old",
      });
      const dispatcher = vi.fn<AuthEventDispatcher>();
      const prismaStub = makePrismaStub();

      const { PasswordResetService, AuthError } = await import(
        "../password-reset.service.js"
      );
      const service = new PasswordResetService(
        userRepo as never,
        tokenRepo as never,
        dispatcher,
        prismaStub as never,
      );

      let caught: unknown;
      try {
        await service.consumeReset(
          "unknown-token-string-of-sufficient-length-1234567890",
          "newPassword",
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect(
        (caught as InstanceType<typeof AuthError>).code,
      ).toBe("INVALID_RESET_TOKEN");
      expect(
        (caught as InstanceType<typeof AuthError>).message.toLowerCase(),
      ).not.toContain("not found");
      expect(userRepo.updatePassword).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();
      // The service looked up the token by sha256(rawToken) via the port.
      expect(tokenRepo.findByHash).toHaveBeenCalledTimes(1);
      expect(prismaStub.$transaction).not.toHaveBeenCalled();
    });
  });
});
