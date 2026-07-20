import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@core/database";
import type { DomainEvent } from "@core/events";

import type { AuthEventDispatcher } from "../events.js";

/**
 * TDD contract for the M3 superadmin extensions to `SessionService`
 * (module-3-superadmin — task 2.1 RED), now updated for the M4
 * 6-field spec-literal projection (module-4-privacy — task 1.8).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §4
 * (`session-service.ts` rows) and the M4 `auth-server-surface` spec's
 * "Session List by User" / "Revoke Single Session" / "Revoke All
 * Sessions for User" requirements, SessionService exposes three
 * admin-side operations:
 *
 *   - `list(userId)` — returns every session owned by the user sorted
 *     DESC by `lastActiveAt` (NULLs last). The M4 projection is the
 *     spec-literal 6-field shape: `{ id, userId, createdAt,
 *     lastActiveAt, userAgent, ipAddress }`. `sessionToken` is NOT
 *     present. Detailed projection contract: see
 *     `session-service.list-projection.test.ts`.
 *   - `revoke(sessionId, actorId, ipAddress, userAgent)` — deletes the
 *     session row by its primary key and emits `auth.session.revoked`
 *     with the M3 widening payload:
 *     `{ actorId, targetUserId, sessionId, ipAddress, userAgent, revokedAt }`.
 *     Idempotent: a missing session is a silent no-op (no event). The
 *     `actorId` is the admin performing the revoke; `targetUserId` is
 *     the user whose session was revoked (recovered by the service
 *     BEFORE the delete so the event still carries it).
 *   - `revokeAll(userId, actorId, ipAddress, userAgent)` — deletes
 *     every session owned by the user, returns the count, emits one
 *     `auth.session.revoked` event with `count` in `metadata` (the
 *     payload also carries `actorId`, `targetUserId`, `ipAddress`,
 *     `userAgent`). Idempotent: zero sessions → still emits the
 *     event with `count: 0` so the audit trail always captures the
 *     admin action.
 *
 * The test mocks the @core/database singleton (mirrors the rbac
 * admin test pattern); the dispatcher is a `vi.fn()` so we assert
 * the exact event payload without a real ring buffer.
 *
 * The M3 RED state (this file before M4): none of `list`, `revoke`,
 * `revokeAll` existed on SessionService. M4 task 1.8 keeps the M3
 * event/dispatch contract intact and updates the `list` projection
 * assertions to the spec-literal shape.
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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

interface SessionRow {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
}

/**
 * Cast the prisma mock back to a narrowly-typed PrismaClient for the
 * constructor argument. The mock only implements the delegates the
 * tests actually call; widening is safe because the production code
 * paths exercised here only touch the stubbed methods.
 */
function asPrismaStub(): PrismaClient {
  return prisma as unknown as PrismaClient;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: never) => {
    return (callback as (tx: typeof prisma) => Promise<unknown>)(prisma);
  });
});

describe("SessionService — admin extensions (M3 task 2.2 GREEN)", () => {
  describe("list", () => {
    // M4 task 1.8: `list` projects the spec-literal 6-field shape
    // (id, userId, createdAt, lastActiveAt, userAgent, ipAddress)
    // ordered by `lastActiveAt DESC NULLS LAST`. sessionToken is
    // intentionally absent. Detailed contract:
    // `session-service.list-projection.test.ts`.
    it("queries sessions for the user with `orderBy: lastActiveAt DESC NULLS LAST` and projects the 6-field shape", async () => {
      const { SessionService } = await import("../session-service.js");
      const rows: SessionRow[] = [
        {
          id: "s-new",
          sessionToken: "t-new",
          userId: "u1",
          expires: new Date("2026-07-03T00:00:00Z"),
          createdAt: new Date("2026-07-01T00:00:00Z"),
          lastActiveAt: new Date("2026-07-18T10:00:00Z"),
          userAgent: "Mozilla/5.0",
          ipAddress: "203.0.113.1",
        },
        {
          id: "s-mid",
          sessionToken: "t-mid",
          userId: "u1",
          expires: new Date("2026-07-02T00:00:00Z"),
          createdAt: new Date("2026-07-01T00:00:00Z"),
          lastActiveAt: new Date("2026-07-17T10:00:00Z"),
          userAgent: "Mozilla/5.0",
          ipAddress: "203.0.113.2",
        },
        {
          id: "s-old",
          sessionToken: "t-old",
          userId: "u1",
          expires: new Date("2026-07-01T00:00:00Z"),
          createdAt: new Date("2026-07-01T00:00:00Z"),
          lastActiveAt: null,
          userAgent: null,
          ipAddress: null,
        },
      ];
      vi.mocked(prisma.session.findMany).mockResolvedValue(rows as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const out = await service.list("u1");

      // The SQL contract: WHERE userId = u1, ORDER BY lastActiveAt DESC NULLS LAST.
      // Prisma is responsible for the actual sort; the test mocks the
      // return value already sorted so the projection assertion holds.
      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
        orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
      });
      // The 6-field spec-literal projection (M4): no `sessionToken`,
      // no `expires`, includes `createdAt` / `lastActiveAt` /
      // `userAgent` / `ipAddress`.
      expect(out).toHaveLength(3);
      expect(out.map((s) => s.id)).toEqual(["s-new", "s-mid", "s-old"]);
      expect(out[0]).toEqual({
        id: "s-new",
        userId: "u1",
        createdAt: new Date("2026-07-01T00:00:00Z"),
        lastActiveAt: new Date("2026-07-18T10:00:00Z"),
        userAgent: "Mozilla/5.0",
        ipAddress: "203.0.113.1",
      });
      // sessionToken MUST NOT appear in the response.
      expect(out[0]).not.toHaveProperty("sessionToken");
      expect(noopDispatcher).not.toHaveBeenCalled();
    });

    it("returns [] when the user has no sessions (empty, NOT an error)", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const out = await service.list("ghost-user");

      expect(out).toEqual([]);
      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: "ghost-user" },
        orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
      });
    });

    it("does NOT emit any event (list is a read — audit goes on mutate paths only)", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      await service.list("u1");

      expect(dispatcher).not.toHaveBeenCalled();
    });
  });

  describe("revoke (admin single-session)", () => {
    it("rolls back the session delete when the audit insert fails", async () => {
      const { SessionService } = await import("../session-service.js");
      const sessionRow: SessionRow = {
        id: "session-atomic",
        sessionToken: "token-atomic",
        userId: "target-user",
        expires: new Date(Date.now() + 60_000),
      };
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockRejectedValue(
        new Error("audit insert failed"),
      );

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      await expect(
        service.revoke("session-atomic", "admin-1", "203.0.113.5", "ua"),
      ).rejects.toThrow("audit insert failed");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(noopDispatcher).not.toHaveBeenCalled();
    });

    it("deletes the session row by its primary key, inserts a REVOKE_SESSION audit row, AND emits auth.session.revoked with the M3 widening payload", async () => {
      const { SessionService } = await import("../session-service.js");
      const sessionRow: SessionRow = {
        id: "session-1",
        sessionToken: "token-1",
        userId: "target-user",
        expires: new Date(Date.now() + 60_000),
      };
      // SessionService.revoke resolves `targetUserId` by reading the row
      // BEFORE the delete (so the event still carries it).
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      await service.revoke("session-1", "admin-1", "203.0.113.5", "Mozilla/5.0 AdminUA");

      // 1. delete by primary key.
      expect(prisma.session.delete).toHaveBeenCalledTimes(1);
      expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: "session-1" } });

      // 2. audit row (task 2.5 — REVOKE_SESSION per
      // `insertAuditEvent` primitive).
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
      const auditArg = (
        vi.mocked(prisma.adminAuditEvent.create).mock.calls[0] as unknown as [
          {
            data: {
              actorId: string;
              targetId: string;
              action: string;
              metadata: Record<string, unknown>;
              ipAddress: string | null;
              userAgent: string | null;
            };
          },
        ]
      )[0];
      expect(auditArg.data.actorId).toBe("admin-1");
      expect(auditArg.data.targetId).toBe("session-1");
      expect(auditArg.data.action).toBe("REVOKE_SESSION");
      expect(auditArg.data.metadata).toEqual({ targetUserId: "target-user" });
      // F4 fix (4R-driven correction): the audit row stores the
      // HMAC-SHA256 hash of the IP, NOT the raw IP. The event
      // payload (observability) keeps the raw IP — only the DB
      // column is hashed.
      const { hashIpForAudit } = await import("../audit.service.js");
      expect(auditArg.data.ipAddress).toBe(hashIpForAudit("203.0.113.5"));
      expect(auditArg.data.userAgent).toBe("Mozilla/5.0 AdminUA");

      // 3. emit exactly one auth.session.revoked with the widened payload.
      expect(dispatcher).toHaveBeenCalledTimes(1);
      const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      expect(event.name).toBe("auth.session.revoked");
      expect(event.userId).toBe("admin-1");
      const payload = event.payload as {
        actorId: string;
        targetUserId: string;
        sessionId: string;
        ipAddress: string;
        userAgent: string;
        revokedAt: Date;
      };
      expect(payload.actorId).toBe("admin-1");
      expect(payload.targetUserId).toBe("target-user");
      expect(payload.sessionId).toBe("session-1");
      expect(payload.ipAddress).toBe("203.0.113.5");
      expect(payload.userAgent).toBe("Mozilla/5.0 AdminUA");
      expect(payload.revokedAt).toBeInstanceOf(Date);
    });

    it("accepts null ipAddress + null userAgent (request context optional, per design D3)", async () => {
      const { SessionService } = await import("../session-service.js");
      const sessionRow: SessionRow = {
        id: "session-1",
        sessionToken: "token-1",
        userId: "target-user",
        expires: new Date(Date.now() + 60_000),
      };
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionRow as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      await service.revoke("session-1", "admin-1", null, null);

      expect(prisma.session.delete).toHaveBeenCalledTimes(1);
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
      const auditArg = (
        vi.mocked(prisma.adminAuditEvent.create).mock.calls[0] as unknown as [
          { data: { ipAddress: unknown; userAgent: unknown } },
        ]
      )[0];
      expect(auditArg.data.ipAddress).toBeNull();
      expect(auditArg.data.userAgent).toBeNull();
      const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      const payload = event.payload as { ipAddress: unknown; userAgent: unknown };
      expect(payload.ipAddress).toBeNull();
      expect(payload.userAgent).toBeNull();
    });

    it("is idempotent: a missing session is a silent no-op (no event, no error)", async () => {
      const { SessionService } = await import("../session-service.js");
      // The pre-delete lookup misses → revoke returns void without
      // dispatching (mirrors the existing revokeByToken idempotency
      // contract per SessionRepository port).
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      await expect(
        service.revoke("ghost-session", "admin-1", "203.0.113.5", "Mozilla/5.0"),
      ).resolves.toBeUndefined();

      expect(prisma.session.delete).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();
    });
  });

  describe("revokeAll (admin bulk revoke)", () => {
    it("runs revoke-all delete and audit insert in one transaction", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      await service.revokeAll("target-user", "admin-1", null, null);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("deletes every session for the user, returns the count, inserts a REVOKE_ALL_SESSIONS audit row, AND emits auth.session.revoked with `count` in the payload", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([
        { id: "s1", sessionToken: "t1", userId: "target-user", expires: new Date() },
        { id: "s2", sessionToken: "t2", userId: "target-user", expires: new Date() },
        { id: "s3", sessionToken: "t3", userId: "target-user", expires: new Date() },
      ] as never);
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      const count = await service.revokeAll("target-user", "admin-1", "203.0.113.5", "Mozilla/5.0");

      expect(count).toBe(3);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "target-user" } });

      // Audit row (task 2.5 — REVOKE_ALL_SESSIONS with count in metadata).
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
      const auditArg = (
        vi.mocked(prisma.adminAuditEvent.create).mock.calls[0] as unknown as [
          { data: { action: string; metadata: Record<string, unknown> } },
        ]
      )[0];
      expect(auditArg.data.action).toBe("REVOKE_ALL_SESSIONS");
      expect(auditArg.data.metadata).toEqual({ count: 3 });

      // Event payload mirrors the audit count.
      expect(dispatcher).toHaveBeenCalledTimes(1);
      const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      expect(event.name).toBe("auth.session.revoked");
      expect(event.userId).toBe("admin-1");
      const payload = event.payload as {
        actorId: string;
        targetUserId: string;
        ipAddress: string;
        userAgent: string;
        count: number;
        revokedAt: Date;
      };
      expect(payload.actorId).toBe("admin-1");
      expect(payload.targetUserId).toBe("target-user");
      expect(payload.ipAddress).toBe("203.0.113.5");
      expect(payload.userAgent).toBe("Mozilla/5.0");
      expect(payload.count).toBe(3);
      expect(payload.revokedAt).toBeInstanceOf(Date);
    });

    it("inserts a REVOKE_ALL_SESSIONS audit row with count=0 AND emits auth.session.revoked (audit ALWAYS emits, even on no-op)", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      const count = await service.revokeAll("no-sessions-user", "admin-1", null, null);

      expect(count).toBe(0);
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
      const auditArg = (
        vi.mocked(prisma.adminAuditEvent.create).mock.calls[0] as unknown as [
          { data: { action: string; metadata: Record<string, unknown> } },
        ]
      )[0];
      expect(auditArg.data.action).toBe("REVOKE_ALL_SESSIONS");
      expect(auditArg.data.metadata).toEqual({ count: 0 });

      expect(dispatcher).toHaveBeenCalledTimes(1);
      const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      const payload = event.payload as { count: number; targetUserId: string };
      expect(payload.count).toBe(0);
      expect(payload.targetUserId).toBe("no-sessions-user");
    });
  });
});
