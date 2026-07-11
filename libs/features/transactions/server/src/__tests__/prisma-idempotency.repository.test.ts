import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { PrismaIdempotencyRepository } from "../infrastructure/repositories/prisma-idempotency.repository.js";
import { DuplicateIdempotencyKeyError } from "../domain/interfaces/idempotency.repository.js";

/**
 * TDD contract for `PrismaIdempotencyRepository` (slice 5 PR #3a).
 *
 * The replay key is `(userId, key)`. `find()` is the read-side boundary
 * owner for the `expiresAt > now` check (W4 readability fix from PR #1):
 * an expired row returns `null` so the service layer doesn't need to
 * re-check the TTL policy.
 *
 * `create(input)` is atomic (not `upsert`) — first-wins semantics. A
 * `@@unique([userId, key])` conflict throws
 * `DuplicateIdempotencyKeyError` (translated from `P2002`); the service
 * catches and falls through to a second-`find` to read the winner's
 * payload. This closes the prior `upsert`'s last-writer-wins race.
 *
 * `purgeExpired` is the cron-callable bulk delete (slice 6+ cron).
 *
 * Test pattern (mirrors `prisma-session.repository.test.ts`):
 * `vi.mock("@core/database")` + `vi.importActual` keeps the shared
 * `isPrismaUniqueViolation` helper real so the P2002 translation
 * actually runs against the real shape-recognition code.
 */
vi.mock("@core/database", async () => {
  const actual = await vi.importActual<typeof import("@core/database")>("@core/database");
  const idempotencyKey = {
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    ...actual,
    prisma: {
      idempotencyKey,
      $transaction: vi.fn(async (fn: (tx: { idempotencyKey: typeof idempotencyKey }) => unknown) =>
        fn({ idempotencyKey }),
      ),
    },
  };
});

import { prisma } from "@core/database";

describe("PrismaIdempotencyRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeIdempRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "ik-1",
      key: "key-1",
      userId: "user-1",
      requestFingerprint: "fp-1",
      responsePayload: { transactionId: "txn-1" },
      responseStatus: 201,
      transactionId: "txn-1",
      expiresAt: new Date("2026-06-01T13:00:00.000Z"),
      createdAt: new Date("2026-06-01T11:00:00.000Z"),
      ...overrides,
    } as never;
  }

  describe("find", () => {
    it("returns null when the row is missing", async () => {
      vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue(null as never);

      const repo = new PrismaIdempotencyRepository();
      const result = await repo.find("user-1", "key-1");

      expect(result).toBeNull();
      const callArg = (
        vi.mocked(prisma.idempotencyKey.findUnique).mock.calls[0] as unknown as [
          { where: { userId_key: { userId: string; key: string } } },
        ]
      )[0];
      expect(callArg.where).toEqual({
        userId_key: { userId: "user-1", key: "key-1" },
      });
    });

    it("returns the projected IdempotencyKey when the row expires in the future", async () => {
      vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue(fakeIdempRow() as never);

      const repo = new PrismaIdempotencyRepository();
      const result = await repo.find("user-1", "key-1");

      expect(result).not.toBeNull();
      expect(result!.key).toBe("key-1");
      expect(result!.userId).toBe("user-1");
      expect(result!.requestFingerprint).toBe("fp-1");
      expect(result!.responseStatus).toBe(201);
      expect(result!.transactionId).toBe("txn-1");
      expect(result!.expiresAt).toBeInstanceOf(Date);
    });

    it("returns null when expiresAt is at or before now (boundary-owned filter, W4 readability fix)", async () => {
      vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue(
        fakeIdempRow({
          expiresAt: new Date("2026-06-01T12:00:00.000Z"), // equals now
        }) as never,
      );

      const repo = new PrismaIdempotencyRepository();
      const result = await repo.find("user-1", "key-1");

      expect(result).toBeNull();
    });
  });

  describe("create — atomic first-wins", () => {
    it("calls `create` with the canonical column shape and returns the projected row", async () => {
      vi.mocked(prisma.idempotencyKey.create).mockResolvedValue(
        fakeIdempRow({ id: "ik-new" }) as never,
      );

      const repo = new PrismaIdempotencyRepository();
      const inserted = await repo.create({
        key: "key-1",
        userId: "user-1",
        requestFingerprint: "fp-1",
        responsePayload: { transactionId: "txn-1" },
        responseStatus: 201,
        transactionId: "txn-1",
        expiresAt: new Date("2026-06-02T12:00:00.000Z"),
      });

      expect(prisma.idempotencyKey.create).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(prisma.idempotencyKey.create).mock.calls[0] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0];
      expect(callArg.data.key).toBe("key-1");
      expect(callArg.data.userId).toBe("user-1");
      expect(callArg.data.requestFingerprint).toBe("fp-1");
      expect(callArg.data.responseStatus).toBe(201);
      expect(callArg.data.transactionId).toBe("txn-1");
      expect(callArg.data.expiresAt).toBeInstanceOf(Date);
      // No `where` clause — `create` doesn't accept one. The unique-key
      // race is handled by the `@@unique([userId, key])` constraint +
      // the P2002 → DuplicateIdempotencyKeyError translation below.
      expect(callArg.data.responsePayload).toEqual({ transactionId: "txn-1" });

      expect(inserted.id).toBe("ik-new");
      expect(inserted.userId).toBe("user-1");
      expect(inserted.key).toBe("key-1");
    });

    it("translates Prisma's P2002 (single-column string target) to DuplicateIdempotencyKeyError", async () => {
      // Prisma emits `meta.target` as a `string` for single-field
      // `@@unique(col)`. The IDEMPOTENCY constraint is compound
      // (`@@unique([userId, key])`) so this shape doesn't occur in
      // production; the test pins the helper's single-string branch
      // so a future single-column migration is still translated.
      vi.mocked(prisma.idempotencyKey.create).mockRejectedValue({
        code: "P2002",
        meta: { target: "userId" },
      } as never);

      const repo = new PrismaIdempotencyRepository();
      await expect(
        repo.create({
          key: "key-1",
          userId: "user-1",
          requestFingerprint: "fp-1",
          responsePayload: { transactionId: "txn-1" },
          responseStatus: 201,
          transactionId: "txn-1",
          expiresAt: new Date("2026-06-02T12:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(DuplicateIdempotencyKeyError);
    });

    it("translates Prisma's P2002 (string[] target shape — compound unique) to DuplicateIdempotencyKeyError", async () => {
      // Same translation for the `meta.target: string[]` shape that
      // Prisma emits for compound unique constraints. The shared
      // `isPrismaUniqueViolation` helper recognizes both shapes.
      vi.mocked(prisma.idempotencyKey.create).mockRejectedValue({
        code: "P2002",
        meta: { target: ["userId", "key"] },
      } as never);

      const repo = new PrismaIdempotencyRepository();
      await expect(
        repo.create({
          key: "key-1",
          userId: "user-1",
          requestFingerprint: "fp-1",
          responsePayload: { transactionId: "txn-1" },
          responseStatus: 201,
          transactionId: "txn-1",
          expiresAt: new Date("2026-06-02T12:00:00.000Z"),
        }),
      ).rejects.toBeInstanceOf(DuplicateIdempotencyKeyError);
    });

    it("passes through Prisma errors other than P2002 (no translation)", async () => {
      const unexpected = new Error("connection reset");
      vi.mocked(prisma.idempotencyKey.create).mockRejectedValue(unexpected as never);

      const repo = new PrismaIdempotencyRepository();
      await expect(
        repo.create({
          key: "key-1",
          userId: "user-1",
          requestFingerprint: "fp-1",
          responsePayload: { transactionId: "txn-1" },
          responseStatus: 201,
          transactionId: "txn-1",
          expiresAt: new Date("2026-06-02T12:00:00.000Z"),
        }),
      ).rejects.toBe(unexpected);
    });

    it("DuplicateIdempotencyKeyError carries the userId + key for service-side logging", () => {
      // The service logs the duplicate key for observability; the
      // constructor captures both fields.
      const err = new DuplicateIdempotencyKeyError("user-42", "key-99");
      expect(err.userId).toBe("user-42");
      expect(err.key).toBe("key-99");
      expect(err.name).toBe("DuplicateIdempotencyKeyError");
    });
  });

  describe("purgeExpired", () => {
    it("deletes every row whose expiresAt is strictly earlier than `now` and returns the count", async () => {
      vi.mocked(prisma.idempotencyKey.deleteMany).mockResolvedValue({
        count: 7,
      } as never);

      const repo = new PrismaIdempotencyRepository();
      const purgeAt = new Date("2026-06-01T12:00:00.000Z");
      const purged = await repo.purgeExpired(purgeAt);

      expect(purged).toBe(7);
      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(prisma.idempotencyKey.deleteMany).mock.calls[0] as unknown as [
          { where: { expiresAt: { lt: Date } } },
        ]
      )[0];
      expect(callArg.where.expiresAt.lt).toBeInstanceOf(Date);
      expect(callArg.where.expiresAt.lt.getTime()).toBe(purgeAt.getTime());
    });
  });
});
