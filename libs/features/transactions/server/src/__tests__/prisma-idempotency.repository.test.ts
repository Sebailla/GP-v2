import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * TDD contract for `PrismaIdempotencyRepository` (slice 5 PR #2 — brief T5.7).
 *
 * The replay key is `(userId, key)`. `find()` is the read-side boundary
 * owner for the `expiresAt > now` check (W4 readability fix from PR #1):
 * an expired row returns `null` so the service layer doesn't need to
 * re-check the TTL policy.
 *
 * `upsert()` is a Postgres `ON CONFLICT DO UPDATE`; `purgeExpired` is the
 * cron-callable bulk delete (slice 6+ cron schedules a 15-min call).
 *
 * Test pattern (mirrors `prisma-session.repository.test.ts`):
 * `vi.mock("@core/database")` stubs the singleton.
 */

vi.mock("@core/database", () => ({
	prisma: {
		idempotencyKey: {
			findUnique: vi.fn(),
			upsert: vi.fn(),
			deleteMany: vi.fn(),
		},
	},
}));

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

	describe("find", () => {
		it("returns null when the row is missing", async () => {
			const { PrismaIdempotencyRepository } = await import(
				"../infrastructure/repositories/prisma-idempotency.repository.js"
			);
			vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue(
				null as never,
			);

			const repo = new PrismaIdempotencyRepository();
			const result = await repo.find("user-1", "key-1");

			expect(result).toBeNull();
			// The composite unique key MUST be used (NOT just `key`).
			const callArg = (
				vi.mocked(prisma.idempotencyKey.findUnique).mock
					.calls[0] as unknown as [
					{ where: { userId_key: { userId: string; key: string } } },
				]
			)[0];
			expect(callArg.where).toEqual({
				userId_key: { userId: "user-1", key: "key-1" },
			});
		});

		it("returns the projected IdempotencyKey when the row expires in the future", async () => {
			const { PrismaIdempotencyRepository } = await import(
				"../infrastructure/repositories/prisma-idempotency.repository.js"
			);
			vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue({
				id: "ik-1",
				key: "key-1",
				userId: "user-1",
				requestFingerprint: "fp-1",
				responsePayload: { transactionId: "txn-1" },
				responseStatus: 201,
				transactionId: "txn-1",
				expiresAt: new Date("2026-06-01T13:00:00.000Z"), // +1h from now
				createdAt: new Date("2026-06-01T11:00:00.000Z"),
			} as never);

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

		it("returns null when the row's expiresAt is at or before now (boundary-owned filter, W4 readability fix)", async () => {
			const { PrismaIdempotencyRepository } = await import(
				"../infrastructure/repositories/prisma-idempotency.repository.js"
			);
			vi.mocked(prisma.idempotencyKey.findUnique).mockResolvedValue({
				id: "ik-1",
				key: "key-1",
				userId: "user-1",
				requestFingerprint: "fp-1",
				responsePayload: { transactionId: "txn-1" },
				responseStatus: 201,
				transactionId: "txn-1",
				// expiresAt equals `now` → treated as expired (the boundary uses `<=`).
				expiresAt: new Date("2026-06-01T12:00:00.000Z"),
				createdAt: new Date("2026-06-01T11:00:00.000Z"),
			} as never);

			const repo = new PrismaIdempotencyRepository();
			const result = await repo.find("user-1", "key-1");

			// The service MUST NOT need to re-check expiresAt — the adapter
			// masks expired rows as miss.
			expect(result).toBeNull();
		});
	});

	describe("upsert", () => {
		it("calls upsert with a composite (userId, key) key, create on miss, update on hit", async () => {
			const { PrismaIdempotencyRepository } = await import(
				"../infrastructure/repositories/prisma-idempotency.repository.js"
			);
			vi.mocked(prisma.idempotencyKey.upsert).mockResolvedValue({} as never);

			const repo = new PrismaIdempotencyRepository();
			await repo.upsert({
				key: "key-1",
				userId: "user-1",
				requestFingerprint: "fp-1",
				responsePayload: { transactionId: "txn-1" },
				responseStatus: 201,
				transactionId: "txn-1",
				expiresAt: new Date("2026-06-02T12:00:00.000Z"),
			});

			expect(prisma.idempotencyKey.upsert).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.idempotencyKey.upsert).mock.calls[0] as unknown as [
					{
						where: { userId_key: { userId: string; key: string } };
						create: Record<string, unknown>;
						update: Record<string, unknown>;
					},
				]
			)[0];

			expect(callArg.where).toEqual({
				userId_key: { userId: "user-1", key: "key-1" },
			});
			expect(callArg.create.key).toBe("key-1");
			expect(callArg.create.userId).toBe("user-1");
			expect(callArg.create.requestFingerprint).toBe("fp-1");
			expect(callArg.create.responseStatus).toBe(201);
			expect(callArg.create.transactionId).toBe("txn-1");
			expect(callArg.create.expiresAt).toBeInstanceOf(Date);

			// Update only mutates the response cache columns — never the
			// composite key nor the original fingerprint.
			expect(callArg.update.responsePayload).toEqual({
				transactionId: "txn-1",
			});
			expect(callArg.update.responseStatus).toBe(201);
			expect(callArg.update.transactionId).toBe("txn-1");
			expect(callArg.update.expiresAt).toBeInstanceOf(Date);
			expect(callArg.update).not.toHaveProperty("key");
			expect(callArg.update).not.toHaveProperty("userId");
			expect(callArg.update).not.toHaveProperty("requestFingerprint");
		});
	});

	describe("purgeExpired", () => {
		it("deletes every row whose expiresAt is strictly earlier than `now` and returns the count", async () => {
			const { PrismaIdempotencyRepository } = await import(
				"../infrastructure/repositories/prisma-idempotency.repository.js"
			);
			vi.mocked(prisma.idempotencyKey.deleteMany).mockResolvedValue({
				count: 7,
			} as never);

			const repo = new PrismaIdempotencyRepository();
			const purgeAt = new Date("2026-06-01T12:00:00.000Z");
			const purged = await repo.purgeExpired(purgeAt);

			expect(purged).toBe(7);
			expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.idempotencyKey.deleteMany).mock
					.calls[0] as unknown as [{ where: { expiresAt: { lt: Date } } }]
			)[0];
			expect(callArg.where.expiresAt.lt).toBeInstanceOf(Date);
			// The boundary uses strict `<` semantics: `now` itself is NOT purged,
			// only rows strictly before.
			expect(callArg.where.expiresAt.lt.getTime()).toBe(purgeAt.getTime());
		});
	});
});
