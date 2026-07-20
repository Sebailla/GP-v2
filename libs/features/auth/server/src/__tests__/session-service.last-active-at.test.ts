import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@core/database";

import type { AuthEventDispatcher } from "../events.js";

/**
 * TDD contract for the `Session.lastActiveAt` coalesce-write on
 * `SessionService.getCurrentUser` (module-4-privacy — task 1.5 RED).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §2 D1 + §3.2, the
 * coalesce pattern uses a DB-level conditional UPDATE:
 *
 *   prisma.session.update({
 *     where: { id, OR: [
 *       { lastActiveAt: null },                     // new session, write now
 *       { lastActiveAt: { lt: now - 60_000 } }     // older than 60s, write now
 *     ]},
 *     data: { lastActiveAt: now }
 *   })
 *   → count=0: coalesce hit (someone else won, OR another worker
 *             already updated within the 60s window)
 *   → count=1: write succeeded
 *
 * Bound: the cut-off is 60s. Every write within 60s of the previous
 * write coalesces to a single update per session across N concurrent
 * workers. Bounded write amplification = 1 / 60s / session.
 *
 * The CurrentUser projection (id / email / role) is returned
 * UNCHANGED regardless of coalesce outcome — the validation step's
 * side-effect is purely on `Session.lastActiveAt`, never on the user
 * projection.
 *
 * Deviation (from task 1.5 wording): the task description names the
 * method `validateSession`. The existing public method on
 * `SessionService` is `getCurrentUser(token)` — the same method that
 * validates the session. The coalesce-write lands there to match the
 * existing call site (NextAuth `session()` callback). No
 * `validateSession` method is added.
 *
 * RED state (this file): `getCurrentUser` does NOT call
 * `prisma.session.update` with the coalesce WHERE clause yet. Every
 * test asserts the new side-effect, which the current implementation
 * never performs — so the assertions fail for the expected reason
 * (mock not called, OR called without the coalesce WHERE clause).
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    adminAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@core/database";

const noopDispatcher = vi.fn<AuthEventDispatcher>();

beforeEach(() => {
  vi.resetAllMocks();
  // Mirror the existing admin-test transaction stub: the `tx`
  // callback runs against the same `prisma` mock instance so the
  // test can assert the embedded create call inside a transaction.
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: never) => {
    return (callback as (tx: typeof prisma) => Promise<unknown>)(prisma);
  });
});

/**
 * Test helpers — the existing `SessionService` constructor accepts
 * the four arguments the admin test uses. We pass `undefined` for the
 * `sessionRepo` and `userRepo` so the default `PrismaSessionRepository`
 * and `PrismaUserRepository` adapters (which read from the mocked
 * `prisma`) take over — exactly mirroring the slice-3 batch-6 pattern
 * in `session-service.test.ts`.
 */
async function makeService() {
  const { SessionService } = await import("../session-service.js");
  return new SessionService(prisma, undefined, undefined, noopDispatcher);
}

describe("SessionService.getCurrentUser — Session.lastActiveAt coalesce (M4 task 1.5)", () => {
  describe("RED: new session writes (lastActiveAt IS NULL)", () => {
    it("writes now() to lastActiveAt when the session row has lastActiveAt = NULL", async () => {
      const sessionRow = {
        id: "session-new",
        sessionToken: "valid-token",
        userId: "user-1",
        expires: new Date(Date.now() + 60_000),
        lastActiveAt: null,
      };
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "USER" as const,
        hashedPassword: "$2a$10$some-hash",
      } as never);
      // The coalesce UPDATE resolves to count=1 — a fresh row, no race.
      vi.mocked(prisma.session.update).mockResolvedValue({ count: 1 } as never);

      const service = await makeService();
      const before = Date.now();
      const result = await service.getCurrentUser("valid-token");
      const after = Date.now();

      // The CurrentUser projection is unchanged (coalesce is a
      // side-effect, never on the user projection).
      expect(result).toEqual({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
      });

      // The coalesce UPDATE was called exactly once, with the
      // `lastActiveAt IS NULL` branch of the OR clause active.
      expect(prisma.session.update).toHaveBeenCalledTimes(1);
      const call = (
        vi.mocked(prisma.session.update).mock.calls[0] as unknown as [
          {
            where: {
              id: string;
              OR: ReadonlyArray<{ lastActiveAt?: unknown }>;
            };
            data: { lastActiveAt: Date };
          },
        ]
      )[0];
      expect(call.where.id).toBe("session-new");
      // The OR clause MUST include the `lastActiveAt: null` branch
      // (per D1).
      const orClause = call.where.OR;
      expect(orClause).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ lastActiveAt: null }),
        ]),
      );
      // The `lastActiveAt: { lt: <cutoff> }` branch — the cutoff is
      // `now - 60_000`, so the bound is monotonically within
      // [before - 60_000, after - 60_000].
      const ltBranch = orClause.find(
        (branch): branch is { lastActiveAt: { lt: Date } } =>
          "lastActiveAt" in branch && "lt" in branch.lastActiveAt,
      );
      expect(ltBranch).toBeDefined();
      const cutoff = (ltBranch as { lastActiveAt: { lt: Date } }).lastActiveAt.lt;
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 60_000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(after - 60_000);
      // The data.lastActiveAt is `now` — also within [before, after].
      expect(call.data.lastActiveAt).toBeInstanceOf(Date);
      const writeAt = call.data.lastActiveAt.getTime();
      expect(writeAt).toBeGreaterThanOrEqual(before);
      expect(writeAt).toBeLessThanOrEqual(after);
    });
  });

  describe("RED: stale session writes (lastActiveAt < now - 60s)", () => {
    it("writes now() when lastActiveAt is older than the 60s threshold", async () => {
      // lastActiveAt is 5 minutes in the past → strictly less than
      // `now - 60_000`, so the lt-branch fires.
      const staleTimestamp = new Date(Date.now() - 5 * 60_000);
      const sessionRow = {
        id: "session-stale",
        sessionToken: "stale-token",
        userId: "user-2",
        expires: new Date(Date.now() + 60_000),
        lastActiveAt: staleTimestamp,
      };
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-2",
        email: "bob@example.com",
        role: "USER" as const,
        hashedPassword: "$2a$10$some-hash",
      } as never);
      vi.mocked(prisma.session.update).mockResolvedValue({ count: 1 } as never);

      const service = await makeService();
      await service.getCurrentUser("stale-token");

      // The coalesce UPDATE still runs — Prisma returns count=1
      // because the OR clause matches the lt-branch.
      expect(prisma.session.update).toHaveBeenCalledTimes(1);
      const call = (
        vi.mocked(prisma.session.update).mock.calls[0] as unknown as [
          {
            where: {
              id: string;
              OR: ReadonlyArray<{ lastActiveAt?: unknown }>;
            };
            data: { lastActiveAt: Date };
          },
        ]
      )[0];
      expect(call.where.id).toBe("session-stale");
      expect(call.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ lastActiveAt: null }),
        ]),
      );
    });
  });

  describe("RED: race condition — second update within 60s returns 0 rows", () => {
    it("does NOT throw when the coalesce UPDATE returns 0 (another worker won)", async () => {
      // The OR clause is the safety net — when another worker has
      // already written within the 60s window, Postgres returns 0
      // rows affected. The service MUST treat 0 as a successful
      // coalesce (no error, no retry, no log noise) and still return
      // the CurrentUser projection.
      const sessionRow = {
        id: "session-race",
        sessionToken: "race-token",
        userId: "user-3",
        expires: new Date(Date.now() + 60_000),
        lastActiveAt: new Date(Date.now() - 1_000), // within 60s window
      };
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-3",
        email: "carol@example.com",
        role: "USER" as const,
        hashedPassword: "$2a$10$some-hash",
      } as never);
      // Coalesce hit: the OR clause matches no rows because another
      // worker already wrote within the window.
      vi.mocked(prisma.session.update).mockResolvedValue({ count: 0 } as never);

      const service = await makeService();
      const result = await service.getCurrentUser("race-token");

      expect(result).toEqual({
        id: "user-3",
        email: "carol@example.com",
        role: "USER",
      });
      // The UPDATE was attempted exactly once (no retry on count=0).
      expect(prisma.session.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("RED: existing validation paths still work", () => {
    it("throws AuthError('INVALID_SESSION') when sessionToken is unknown — coalesce is skipped", async () => {
      // Sanity: the coalesce side-effect MUST NOT mask the existing
      // pre-conditions. A missing session row short-circuits BEFORE
      // the coalesce write.
      const { AuthError } = await import("../session-service.js");
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

      const service = await makeService();

      let caught: unknown;
      try {
        await service.getCurrentUser("unknown-token");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect((caught as InstanceType<typeof AuthError>).code).toBe("INVALID_SESSION");
      // The coalesce UPDATE must NOT run when the session row is missing.
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it("throws AuthError('SESSION_EXPIRED') when session.expires is in the past — coalesce is skipped", async () => {
      const { AuthError } = await import("../session-service.js");
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "session-1",
        sessionToken: "expired-token",
        userId: "user-1",
        expires: new Date(Date.now() - 1000),
        lastActiveAt: null,
      } as never);

      const service = await makeService();

      let caught: unknown;
      try {
        await service.getCurrentUser("expired-token");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect((caught as InstanceType<typeof AuthError>).code).toBe("SESSION_EXPIRED");
      // The coalesce UPDATE must NOT run when the session is expired.
      expect(prisma.session.update).not.toHaveBeenCalled();
    });

    it("throws AuthError('INVALID_SESSION') when the user is missing — coalesce is skipped", async () => {
      // Orphaned session: row exists + not expired, but the FK owner
      // was hard-deleted. Coalesce is skipped because the validation
      // fails BEFORE the side-effect.
      const { AuthError } = await import("../session-service.js");
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "session-orphan",
        sessionToken: "orphan-token",
        userId: "ghost-user",
        expires: new Date(Date.now() + 60_000),
        lastActiveAt: null,
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      const service = await makeService();

      let caught: unknown;
      try {
        await service.getCurrentUser("orphan-token");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect((caught as InstanceType<typeof AuthError>).code).toBe("INVALID_SESSION");
      expect(prisma.session.update).not.toHaveBeenCalled();
    });
  });
});

/**
 * Helper cast for the `prisma` mock — the existing admin test uses
 * the same widening trick. Kept local so this file stays self-contained.
 */
function asPrismaStub(): PrismaClient {
  return prisma as unknown as PrismaClient;
}

// Silence the unused-helper lint without removing the safety cast above.
void asPrismaStub;
