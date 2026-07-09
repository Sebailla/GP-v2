import { describe, it, expect, vi, beforeEach } from "vitest";

import { PrismaAuditLogRepository } from "../infrastructure/repositories/prisma-audit-log.repository.js";

/**
 * TDD contract for `PrismaAuditLogRepository` (slice 5 PR #3a — T5.9
 * supporting infrastructure).
 *
 * The adapter wraps the `AuditLog` Prisma model. The service layer
 * (PR #3a's `TransactionService` + `CategoryService`) calls
 * `append()` once per state-mutating action; the read paths
 * (`findByEntity`, `listByActor`) are for the future audit-log UI
 * (slice 6+).
 *
 * Test pattern (mirrors `prisma-category.repository.test.ts`):
 * `vi.mock("@core/database")` stubs the singleton; the shared guards
 * (P2002, P2025) come from the real `@core/database` module via
 * `vi.importActual` so the adapter's `isPrismaUniqueViolation` etc.
 * continue to work without per-test duplication.
 */
vi.mock("@core/database", async () => {
  const actual = await vi.importActual<typeof import("@core/database")>(
    "@core/database",
  );
  const auditLog = {
    create: vi.fn(),
    findMany: vi.fn(),
  };
  return {
    ...actual,
    prisma: {
      auditLog,
      $transaction: vi.fn(
        async (fn: (tx: { auditLog: typeof auditLog }) => unknown) =>
          fn({ auditLog }),
      ),
    },
  };
});

import { prisma } from "@core/database";

describe("PrismaAuditLogRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Build a fake Prisma row for an audit log entry. Mirrors the
   * column shape so the `projectAuditLog` copy is exercised.
   */
  function fakeAuditRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "audit-1",
      entityType: "Transaction",
      entityId: "txn-1",
      action: "create",
      actorId: "user-1",
      payload: { foo: "bar" },
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
      ...overrides,
    } as never;
  }

  describe("append", () => {
    it("calls `create` with the canonical column shape", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue(fakeAuditRow() as never);

      const repo = new PrismaAuditLogRepository();
      await repo.append({
        entityType: "Transaction",
        entityId: "txn-1",
        action: "create",
        actorId: "user-1",
        payload: { amount: "12.34" },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(prisma.auditLog.create).mock.calls[0] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0];
      expect(callArg.data.entityType).toBe("Transaction");
      expect(callArg.data.entityId).toBe("txn-1");
      expect(callArg.data.action).toBe("create");
      expect(callArg.data.actorId).toBe("user-1");
      // The service is responsible for JSON-safety; the cast below
      // passes the value through to Prisma's `Json` column.
      expect(callArg.data.payload).toEqual({ amount: "12.34" });
    });

    it("returns the projected AuditLog (id + createdAt are server-assigned)", async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue(
        fakeAuditRow({
          id: "audit-99",
          entityType: "Category",
          entityId: "cat-1",
          action: "softDelete",
          actorId: "user-2",
          payload: { reason: "user request" },
          createdAt: new Date("2026-06-02T00:00:00.000Z"),
        }) as never,
      );

      const repo = new PrismaAuditLogRepository();
      const log = await repo.append({
        entityType: "Category",
        entityId: "cat-1",
        action: "softDelete",
        actorId: "user-2",
        payload: { reason: "user request" },
      });

      expect(log.id).toBe("audit-99");
      expect(log.entityType).toBe("Category");
      expect(log.entityId).toBe("cat-1");
      expect(log.action).toBe("softDelete");
      expect(log.actorId).toBe("user-2");
      expect(log.payload).toEqual({ reason: "user request" });
      expect(log.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("findByEntity", () => {
    it("queries with `where: { entityType, entityId }` and orders by createdAt desc", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        fakeAuditRow({ id: "audit-2" }),
        fakeAuditRow({ id: "audit-1" }),
      ] as never);

      const repo = new PrismaAuditLogRepository();
      await repo.findByEntity("Transaction", "txn-1");

      expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(prisma.auditLog.findMany).mock.calls[0] as unknown as [
          {
            where: { entityType: string; entityId: string };
            orderBy: { createdAt: "desc" };
            take: number;
          },
        ]
      )[0];
      expect(callArg.where.entityType).toBe("Transaction");
      expect(callArg.where.entityId).toBe("txn-1");
      expect(callArg.orderBy).toEqual({ createdAt: "desc" });
      // Default limit is 50 (matches the audit-log UI's page size).
      expect(callArg.take).toBe(50);
    });

    it("applies the optional `limit` + `before` cursor", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

      const repo = new PrismaAuditLogRepository();
      const cursor = new Date("2026-06-01T00:00:00.000Z");
      await repo.findByEntity("Transaction", "txn-1", {
        limit: 10,
        before: cursor,
      });

      const callArg = (
        vi.mocked(prisma.auditLog.findMany).mock.calls[0] as unknown as [
          {
            where: { entityType: string; entityId: string; createdAt: { lt: Date } };
            take: number;
          },
        ]
      )[0];
      expect(callArg.where.createdAt.lt).toBeInstanceOf(Date);
      expect(callArg.where.createdAt.lt.getTime()).toBe(cursor.getTime());
      expect(callArg.take).toBe(10);
    });

    it("returns the projected rows in createdAt desc order", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        fakeAuditRow({ id: "audit-2", action: "update" }),
        fakeAuditRow({ id: "audit-1", action: "create" }),
      ] as never);

      const repo = new PrismaAuditLogRepository();
      const logs = await repo.findByEntity("Category", "cat-1");

      expect(logs).toHaveLength(2);
      expect(logs[0]!.id).toBe("audit-2");
      expect(logs[1]!.id).toBe("audit-1");
    });
  });

  describe("listByActor", () => {
    it("queries with `where: { actorId }` and orders by createdAt desc", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

      const repo = new PrismaAuditLogRepository();
      await repo.listByActor("user-1");

      const callArg = (
        vi.mocked(prisma.auditLog.findMany).mock.calls[0] as unknown as [
          {
            where: { actorId: string; createdAt?: unknown };
            orderBy: { createdAt: "desc" };
            take: number;
          },
        ]
      )[0];
      expect(callArg.where.actorId).toBe("user-1");
      // No `before` cursor → no `createdAt` filter.
      expect(callArg.where.createdAt).toBeUndefined();
      expect(callArg.orderBy).toEqual({ createdAt: "desc" });
      expect(callArg.take).toBe(50);
    });

    it("applies the optional `before` cursor on the actor's history", async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

      const repo = new PrismaAuditLogRepository();
      const cursor = new Date("2026-06-01T00:00:00.000Z");
      await repo.listByActor("user-1", { limit: 25, before: cursor });

      const callArg = (
        vi.mocked(prisma.auditLog.findMany).mock.calls[0] as unknown as [
          {
            where: { actorId: string; createdAt: { lt: Date } };
            take: number;
          },
        ]
      )[0];
      expect(callArg.where.createdAt.lt).toBeInstanceOf(Date);
      expect(callArg.where.createdAt.lt.getTime()).toBe(cursor.getTime());
      expect(callArg.take).toBe(25);
    });
  });
});