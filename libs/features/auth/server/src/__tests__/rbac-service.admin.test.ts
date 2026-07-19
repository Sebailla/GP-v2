import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@core/database";
import type { DomainEvent } from "@core/events";

import type { AuthEventDispatcher } from "../events.js";

/**
 * TDD contract for the M3 superadmin extensions to `RbacService`
 * (module-3-superadmin — task 1.3 RED).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §4
 * (File Changes — `rbac-service.ts` rows) and the new
 * `openspec/specs/rbac-admin/spec.md`, RbacService gains three
 * admin-only operations:
 *
 *   - `listUsers({ limit, offset })` — returns users sorted DESC by
 *     `createdAt`. Pagination defaults: `limit=50`, `offset=0`.
 *   - `changeRole(userId, newRole, actorId)` — updates the user's
 *     role; inserts an `AdminAuditEvent` row with
 *     `action: "CHANGE_ROLE"` and `metadata: { from, to }`; emits
 *     an `auth.role.changed` DomainEvent. Idempotent (no audit row
 *     when the role is unchanged). Throws when the target user does
 *     not exist (the controller turns that into 404).
 *   - `assertAdmin(userId)` — throws when the user is not ADMIN;
 *     resolves when they are. Used by the controller as a guard.
 *
 * The audit insert goes through the `prisma.adminAuditEvent.create`
 * delegate; the `user.update` write is paired with the audit insert
 * inside a single Prisma transaction so a partial failure rolls back
 * both writes. The event dispatch is awaited (Pattern A) so the
 * observability signal is never lost on a fast controller return.
 *
 * Prisma is mocked at the @core/database boundary so the suite
 * runs without a real database, matching the pattern from
 * `session-service.test.ts`. The mock asserts the SQL-level
 * arguments Prisma receives (where/orderBy/take/skip/data), which
 * is the only contract the GREEN step needs to honour.
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    adminAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@core/database";

const noopDispatcher = vi.fn<AuthEventDispatcher>();

interface UserRow {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
}

/**
 * Cast the prisma mock back to a narrowly-typed PrismaClient for the
 * constructor argument. The mock only implements the delegates the
 * tests actually call; widening it to PrismaClient is safe because
 * the production code paths exercised by these tests only touch
 * the stubbed methods.
 */
function asPrismaStub(): PrismaClient {
  return prisma as unknown as PrismaClient;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("RbacService — admin extensions (M3 task 1.4 GREEN)", () => {
  describe("listUsers", () => {
    it("returns users sorted DESC by createdAt with default pagination", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rows: UserRow[] = [
        { id: "u3", email: "c@example.com", role: "USER", createdAt: new Date("2026-07-03T00:00:00Z") },
        { id: "u2", email: "b@example.com", role: "USER", createdAt: new Date("2026-07-02T00:00:00Z") },
        { id: "u1", email: "a@example.com", role: "ADMIN", createdAt: new Date("2026-07-01T00:00:00Z") },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(rows as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      const out = await rbac.listUsers({ limit: 50, offset: 0 });

      expect(out).toHaveLength(3);
      expect(out.map((u) => u.id)).toEqual(["u3", "u2", "u1"]);
      // The SQL contract: ORDER BY createdAt DESC, take 50, skip 0.
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
      expect(noopDispatcher).not.toHaveBeenCalled();
    });

    it("respects custom limit + offset (pagination triangulation)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      await rbac.listUsers({ limit: 10, offset: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 20,
      });
    });

    it("returns [] when no users exist (empty, NOT an error)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      const out = await rbac.listUsers({ limit: 50, offset: 0 });

      expect(out).toEqual([]);
    });
  });

  describe("changeRole", () => {
    it("updates the user's role, inserts an audit row, and emits auth.role.changed", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const before: UserRow = {
        id: "u1",
        email: "u1@example.com",
        role: "USER",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      };
      const after: UserRow = { ...before, role: "ADMIN" };
      // $transaction receives a callback that uses the tx client; the
      // mock invokes the callback synchronously with the outer client
      // so the same `prisma.user.update` mock records both reads.
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(before as never);
      vi.mocked(prisma.user.update).mockResolvedValue(after as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({
        id: "audit-1",
        actorId: "admin-1",
        targetId: "u1",
        action: "CHANGE_ROLE",
        createdAt: new Date(),
        metadata: { from: "USER", to: "ADMIN" },
        ipAddress: null,
        userAgent: null,
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(async (arg) => {
        // Prisma's $transaction accepts either a callback or an array
        // of promises; the GREEN step uses the callback form so the
        // mock invokes the callback with a tx client and resolves to
        // its return value.
        if (typeof arg === "function") {
          return (arg as (tx: PrismaClient) => Promise<unknown>)(prisma as unknown as PrismaClient);
        }
        return undefined;
      });

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      const result = await rbac.changeRole("u1", "ADMIN", "admin-1");

      expect(result.role).toBe("ADMIN");
      // Audit row carries metadata.from / metadata.to (per
      // `rbac-admin` spec "CHANGE_ROLE row" scenario).
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
      const auditArg = (
        vi.mocked(prisma.adminAuditEvent.create).mock.calls[0] as unknown as [
          {
            data: {
              actorId: string;
              targetId: string;
              action: string;
              metadata: { from: string; to: string };
            };
          },
        ]
      )[0];
      expect(auditArg.data.actorId).toBe("admin-1");
      expect(auditArg.data.targetId).toBe("u1");
      expect(auditArg.data.action).toBe("CHANGE_ROLE");
      expect(auditArg.data.metadata).toEqual({ from: "USER", to: "ADMIN" });

      // auth.role.changed event: payload carries the actor + from/to.
      expect(noopDispatcher).toHaveBeenCalledTimes(1);
      const event = (noopDispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      expect(event.name).toBe("auth.role.changed");
      expect(event.userId).toBe("admin-1");
      const payload = event.payload as {
        actorId: string;
        targetUserId: string;
        fromRole: string;
        toRole: string;
      };
      expect(payload.actorId).toBe("admin-1");
      expect(payload.targetUserId).toBe("u1");
      expect(payload.fromRole).toBe("USER");
      expect(payload.toRole).toBe("ADMIN");
    });

    it("is idempotent: no audit row + no event when the role is unchanged", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const user: UserRow = {
        id: "u1",
        email: "u1@example.com",
        role: "USER",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(user as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      const result = await rbac.changeRole("u1", "USER", "admin-1");

      expect(result.role).toBe("USER");
      expect(prisma.adminAuditEvent.create).not.toHaveBeenCalled();
      expect(noopDispatcher).not.toHaveBeenCalled();
    });

    it("throws when the target user does not exist", async () => {
      const { RbacService } = await import("../rbac-service.js");
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      await expect(rbac.changeRole("ghost", "ADMIN", "admin-1")).rejects.toThrow(
        /user.*not found|unknown user|user not found/i,
      );
      expect(prisma.adminAuditEvent.create).not.toHaveBeenCalled();
      expect(noopDispatcher).not.toHaveBeenCalled();
    });

    // F2 fix (4R-driven correction): last-admin safeguard.
    // `changeRole` MUST refuse to demote the only remaining admin to
    // USER — the system would become permanently admin-less (every
    // admin demoted, no path back to ADMIN except direct SQL).
    // The check runs OUTSIDE the transaction to avoid racing
    // concurrent admin ops; the production code path uses a
    // count-then-act pattern with a comment explaining the
    // non-serializable-isolation caveat.
    describe("last-admin safeguard (F2)", () => {
      it("throws LastAdminError when demoting the only remaining admin", async () => {
        const { RbacService } = await import("../rbac-service.js");
        const { LastAdminError } = await import("../errors.js");
        const onlyAdmin: UserRow = {
          id: "admin-only",
          email: "only@example.com",
          role: "ADMIN",
          createdAt: new Date("2026-07-01T00:00:00Z"),
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(onlyAdmin as never);
        // The count of admins is 1 → last-admin path triggers.
        vi.mocked(prisma.user.count).mockResolvedValueOnce(1 as never);

        const rbac = new RbacService(noopDispatcher, asPrismaStub());
        // Demote yourself (the only admin) to USER → must throw.
        await expect(
          rbac.changeRole("admin-only", "USER", "admin-only"),
        ).rejects.toBeInstanceOf(LastAdminError);

        // No write, no audit, no event — the safeguard fires BEFORE
        // the transaction.
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(prisma.adminAuditEvent.create).not.toHaveBeenCalled();
        expect(noopDispatcher).not.toHaveBeenCalled();
      });

      it("does NOT throw when demoting one of multiple admins (count > 1)", async () => {
        const { RbacService } = await import("../rbac-service.js");
        const adminA: UserRow = {
          id: "admin-a",
          email: "a@example.com",
          role: "ADMIN",
          createdAt: new Date("2026-07-01T00:00:00Z"),
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(adminA as never);
        // The count of admins is 2 → safe to demote one.
        vi.mocked(prisma.user.count).mockResolvedValueOnce(2 as never);
        vi.mocked(prisma.user.update).mockResolvedValue({
          ...adminA,
          role: "USER",
        } as never);
        vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);
        vi.mocked(prisma.$transaction).mockImplementation(async (arg) => {
          if (typeof arg === "function") {
            return (arg as (tx: PrismaClient) => Promise<unknown>)(prisma as unknown as PrismaClient);
          }
          return undefined;
        });

        const rbac = new RbacService(noopDispatcher, asPrismaStub());
        // Demote yourself — you're one of 2 admins → must succeed.
        const result = await rbac.changeRole("admin-a", "USER", "admin-a");
        expect(result.role).toBe("USER");
        expect(prisma.user.update).toHaveBeenCalled();
      });

      it("does NOT throw when demoting a non-admin user (count check irrelevant)", async () => {
        const { RbacService } = await import("../rbac-service.js");
        const user: UserRow = {
          id: "u-1",
          email: "u1@example.com",
          role: "USER",
          createdAt: new Date("2026-07-01T00:00:00Z"),
        };
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(user as never);
        // The existing test for "admin count" must be 1 here (the
        // lone admin is a different user) — but the safeguard only
        // fires when the TARGET is ADMIN AND newRole is USER AND
        // count is 1. Here the target is already USER, so the
        // safeguard must NOT trigger even with count === 1.
        vi.mocked(prisma.user.count).mockResolvedValueOnce(1 as never);
        vi.mocked(prisma.user.update).mockResolvedValue({ ...user, role: "ADMIN" } as never);
        vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);
        vi.mocked(prisma.$transaction).mockImplementation(async (arg) => {
          if (typeof arg === "function") {
            return (arg as (tx: PrismaClient) => Promise<unknown>)(prisma as unknown as PrismaClient);
          }
          return undefined;
        });

        const rbac = new RbacService(noopDispatcher, asPrismaStub());
        // Promote a USER to ADMIN (not a demote-to-USER op) — no
        // last-admin path applies.
        const result = await rbac.changeRole("u-1", "ADMIN", "admin-1");
        expect(result.role).toBe("ADMIN");
      });
    });
  });

  describe("assertAdmin", () => {
    it("resolves when the user has role=ADMIN", async () => {
      const { RbacService } = await import("../rbac-service.js");
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        createdAt: new Date(),
      } as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      await expect(rbac.assertAdmin("admin-1")).resolves.toBeUndefined();
    });

    it("throws when the user has role=USER", async () => {
      const { RbacService } = await import("../rbac-service.js");
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "u1",
        email: "u1@example.com",
        role: "USER",
        createdAt: new Date(),
      } as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      await expect(rbac.assertAdmin("u1")).rejects.toThrow(/not an admin|admin/i);
    });

    it("throws when the user does not exist", async () => {
      const { RbacService } = await import("../rbac-service.js");
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);

      const rbac = new RbacService(noopDispatcher, asPrismaStub());
      await expect(rbac.assertAdmin("ghost")).rejects.toThrow(/not an admin|admin/i);
    });
  });
});