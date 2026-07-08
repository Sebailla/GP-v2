import { describe, it, expect, vi, beforeEach } from "vitest";

import { Decimal, toDecimal } from "@shared-utils/decimal";

import {
	PrismaTransactionRepository,
	TransactionNotFoundError,
} from "../infrastructure/repositories/prisma-transaction.repository.js";

/**
 * TDD contract for `PrismaTransactionRepository` (slice 5 PR #2 — brief T5.7).
 *
 * The transaction adapter owns the persistence boundary for the central
 * aggregate of the slice. It combines:
 *  - D-TX-5 soft-delete invariant on every read query.
 *  - User-scoped reads (every list query filters `createdBy: userId`).
 *  - Cursor pagination (the repository returns an opaque cursor when
 *    more rows exist; the take+1 sentinel detects "more exist").
 *  - Decimal boundary on amount / reportingAmount (D-TX-6).
 *  - P2025 → TransactionNotFoundError translation on update.
 *  - Idempotent soft-delete (swallows P2025).
 *
 * Test pattern (mirrors `prisma-session.repository.test.ts`):
 * `vi.mock("@core/database")` stubs the singleton.
 */

vi.mock("@core/database", () => ({
	prisma: {
		transaction: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			count: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
	},
}));

import { prisma } from "@core/database";

describe("PrismaTransactionRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * Fake "row" object shaped like the Prisma projection. Kept inline so
	 * tests don't depend on the projection function's exact shape; the
	 * adapter's `projectTransaction` does the field-by-field copy.
	 */
	function fakeRow(overrides: Record<string, unknown> = {}) {
		return {
			id: "txn-1",
			amount: { toString: () => "12.34" },
			currencyCode: "USD",
			kind: "expense",
			reportingAmount: null,
			reportingCurrencyCode: null,
			fxRateId: null,
			categoryId: "cat-1",
			notes: null,
			occurredAt: new Date("2026-06-01T12:00:00.000Z"),
			createdBy: "user-1",
			updatedBy: "user-1",
			createdAt: new Date("2026-06-01T12:00:00.000Z"),
			updatedAt: new Date("2026-06-01T12:00:00.000Z"),
			deletedAt: null,
			...overrides,
		};
	}

	describe("findById — D-TX-5", () => {
		it("filters `deletedAt: null` on the read path", async () => {
			vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
				fakeRow() as never,
			);

			const repo = new PrismaTransactionRepository();
			const txn = await repo.findById("txn-1");

			expect(prisma.transaction.findFirst).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.transaction.findFirst).mock.calls[0] as unknown as [
					{ where: { id: string; deletedAt: null } },
				]
			)[0];
			expect(callArg.where).toEqual({ id: "txn-1", deletedAt: null });
			expect(txn).not.toBeNull();
			expect(txn!.amount.toString()).toBe("12.34");
		});

		it("returns null when the row does not exist (or is soft-deleted)", async () => {
			vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

			const repo = new PrismaTransactionRepository();
			const txn = await repo.findById("txn-missing");

			expect(txn).toBeNull();
		});
	});

	describe("list", () => {
		it("filters userScope (`createdBy: userId`) AND D-TX-5 (`deletedAt: null`) on every list query", async () => {
			vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never);
			vi.mocked(prisma.transaction.count).mockResolvedValue(0);

			const repo = new PrismaTransactionRepository();
			await repo.list({ userId: "user-1", pageSize: 20 });

			expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.transaction.findMany).mock.calls[0] as unknown as [
					{
						where: { createdBy: string; deletedAt: null };
						orderBy: unknown;
						take: number;
						cursor?: unknown;
						skip?: number;
					},
				]
			)[0];

			// Both invariants MUST be present on every list call.
			expect(callArg.where.createdBy).toBe("user-1");
			expect(callArg.where.deletedAt).toBeNull();
			expect(callArg.take).toBe(21); // sentinel: pageSize + 1
			expect(callArg.cursor).toBeUndefined();
			expect(callArg.skip).toBeUndefined();
			expect(callArg.orderBy).toEqual([{ occurredAt: "desc" }, { id: "desc" }]);
		});

		it("applies the cursor + skip=1 on the next page", async () => {
			vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never);
			vi.mocked(prisma.transaction.count).mockResolvedValue(0);

			const repo = new PrismaTransactionRepository();
			await repo.list({
				userId: "user-1",
				pageSize: 20,
				cursor: "txn-last-of-prev-page",
			});

			const callArg = (
				vi.mocked(prisma.transaction.findMany).mock.calls[0] as unknown as [
					{ cursor: { id: string }; skip: number },
				]
			)[0];
			expect(callArg.cursor).toEqual({ id: "txn-last-of-prev-page" });
			expect(callArg.skip).toBe(1);
		});

		it("composes the optional filter (categoryId, currencyCode, kind, fromDate, toDate) into the where clause", async () => {
			vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never);
			vi.mocked(prisma.transaction.count).mockResolvedValue(0);

			const repo = new PrismaTransactionRepository();
			const from = new Date("2026-06-01T00:00:00.000Z");
			const to = new Date("2026-06-30T23:59:59.000Z");
			await repo.list({
				userId: "user-1",
				categoryId: "cat-1",
				currencyCode: "USD",
				kind: "expense",
				fromDate: from,
				toDate: to,
			});

			const callArg = (
				vi.mocked(prisma.transaction.findMany).mock.calls[0] as unknown as [
					{
						where: {
							createdBy: string;
							deletedAt: null;
							categoryId?: string;
							currencyCode?: string;
							kind?: string;
							occurredAt?: { gte?: Date; lt?: Date };
						};
					},
				]
			)[0];

			expect(callArg.where.categoryId).toBe("cat-1");
			expect(callArg.where.currencyCode).toBe("USD");
			expect(callArg.where.kind).toBe("expense");
			expect(callArg.where.occurredAt).toBeDefined();
			expect(callArg.where.occurredAt!.gte).toBeInstanceOf(Date);
			expect(callArg.where.occurredAt!.gte!.getTime()).toBe(from.getTime());
			expect(callArg.where.occurredAt!.lt).toBeInstanceOf(Date);
			expect(callArg.where.occurredAt!.lt!.getTime()).toBe(to.getTime());
		});

		it("returns the cursor on the 21st row sentinel (more rows exist)", async () => {
			const rows = Array.from({ length: 21 }, (_, i) =>
				fakeRow({ id: `txn-${String(i + 1).padStart(2, "0")}` }),
			);
			vi.mocked(prisma.transaction.findMany).mockResolvedValue(rows as never);
			vi.mocked(prisma.transaction.count).mockResolvedValue(42);

			const repo = new PrismaTransactionRepository();
			const result = await repo.list({ userId: "user-1", pageSize: 20 });

			expect(result.rows).toHaveLength(20); // sentinel sliced off
			expect(result.total).toBe(42);
			expect(result.cursor).toBe("txn-20");
		});

		it("returns cursor=null when the sentinel is absent (last page)", async () => {
			const rows = Array.from({ length: 15 }, (_, i) =>
				fakeRow({ id: `txn-${String(i + 1).padStart(2, "0")}` }),
			);
			vi.mocked(prisma.transaction.findMany).mockResolvedValue(rows as never);
			vi.mocked(prisma.transaction.count).mockResolvedValue(15);

			const repo = new PrismaTransactionRepository();
			const result = await repo.list({ userId: "user-1", pageSize: 20 });

			expect(result.rows).toHaveLength(15);
			expect(result.cursor).toBeNull();
		});
	});

	describe("create — Decimal boundary (D-TX-6)", () => {
		it("serializes `amount` via `input.amount.toString()` (string, not Decimal instance)", async () => {
			vi.mocked(prisma.transaction.create).mockResolvedValue(
				fakeRow() as never,
			);

			const repo = new PrismaTransactionRepository();
			await repo.create({
				amount: toDecimal("12.34"),
				currencyCode: "USD",
				kind: "expense",
				reportingAmount: null,
				reportingCurrencyCode: null,
				fxRateId: null,
				categoryId: "cat-1",
				notes: null,
				occurredAt: new Date("2026-06-01T12:00:00.000Z"),
				createdBy: "user-1",
				updatedBy: "user-1",
			});

			expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.transaction.create).mock.calls[0] as unknown as [
					{ data: { amount: unknown; [k: string]: unknown } },
				]
			)[0];

			// CRITICAL: amount must be the string repr — Prisma serializes the
			// numeric column from the string, NOT a Decimal JS class instance.
			expect(typeof callArg.data.amount).toBe("string");
			expect(callArg.data.amount).toBe("12.34");
		});

		it("serializes `reportingAmount=null` as a literal `null` on the Prisma payload", async () => {
			vi.mocked(prisma.transaction.create).mockResolvedValue(
				fakeRow() as never,
			);

			const repo = new PrismaTransactionRepository();
			await repo.create({
				amount: toDecimal("12.34"),
				currencyCode: "USD",
				kind: "expense",
				reportingAmount: null,
				reportingCurrencyCode: null,
				fxRateId: null,
				categoryId: "cat-1",
				notes: null,
				occurredAt: new Date("2026-06-01T12:00:00.000Z"),
				createdBy: "user-1",
				updatedBy: "user-1",
			});

			const callArg = (
				vi.mocked(prisma.transaction.create).mock.calls[0] as unknown as [
					{ data: { reportingAmount: unknown } },
				]
			)[0];
			expect(callArg.data.reportingAmount).toBeNull();
		});

		it("serializes a present `reportingAmount` Decimal via .toString()", async () => {
			vi.mocked(prisma.transaction.create).mockResolvedValue(
				fakeRow() as never,
			);

			const repo = new PrismaTransactionRepository();
			await repo.create({
				amount: toDecimal("12.34"),
				currencyCode: "USD",
				kind: "expense",
				reportingAmount: toDecimal("12340.0014"),
				reportingCurrencyCode: "ARS",
				fxRateId: "fx-1",
				categoryId: "cat-1",
				notes: null,
				occurredAt: new Date("2026-06-01T12:00:00.000Z"),
				createdBy: "user-1",
				updatedBy: "user-1",
			});

			const callArg = (
				vi.mocked(prisma.transaction.create).mock.calls[0] as unknown as [
					{ data: { reportingAmount: unknown } },
				]
			)[0];
			expect(typeof callArg.data.reportingAmount).toBe("string");
			expect(callArg.data.reportingAmount).toBe("12340.0014");
		});
	});

	describe("update", () => {
		it("translates P2025 into `TransactionNotFoundError`", async () => {
			vi.mocked(prisma.transaction.update).mockRejectedValue({
				code: "P2025",
			} as never);

			const repo = new PrismaTransactionRepository();
			await expect(
				repo.update("txn-missing", { updatedBy: "user-1" }),
			).rejects.toBeInstanceOf(TransactionNotFoundError);
		});

		it("serializes a patched `amount` via .toString()", async () => {
			vi.mocked(prisma.transaction.update).mockResolvedValue(
				fakeRow() as never,
			);

			const repo = new PrismaTransactionRepository();
			await repo.update("txn-1", {
				amount: toDecimal("99.99"),
				updatedBy: "user-1",
			});

			const callArg = (
				vi.mocked(prisma.transaction.update).mock.calls[0] as unknown as [
					{ data: { amount: unknown } },
				]
			)[0];
			expect(callArg.data.amount).toBe("99.99");
		});
	});

	describe("softDelete", () => {
		it("swallows P2025 silently (idempotent — soft-deleting a soft-deleted row is a no-op)", async () => {
			vi.mocked(prisma.transaction.update).mockRejectedValue({
				code: "P2025",
			} as never);

			const repo = new PrismaTransactionRepository();
			await expect(
				repo.softDelete("txn-missing", "user-1"),
			).resolves.toBeUndefined();
		});

		it("calls update with `deletedAt: Date, updatedBy: actorId`", async () => {
			vi.mocked(prisma.transaction.update).mockResolvedValue({} as never);

			const repo = new PrismaTransactionRepository();
			await repo.softDelete("txn-1", "user-42");

			const callArg = (
				vi.mocked(prisma.transaction.update).mock.calls[0] as unknown as [
					{
						where: { id: string };
						data: { deletedAt: Date; updatedBy: string };
					},
				]
			)[0];
			expect(callArg.where.id).toBe("txn-1");
			expect(callArg.data.deletedAt).toBeInstanceOf(Date);
			expect(callArg.data.updatedBy).toBe("user-42");
		});
	});

	describe("Decimal boundary (inbound projection)", () => {
		it("re-parses Prisma's runtime Decimal into the domain Decimal via .toString()", async () => {
			vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
				fakeRow({
					amount: { toString: () => "12.34" },
					reportingAmount: { toString: () => "12340.0014" },
				}) as never,
			);

			const repo = new PrismaTransactionRepository();
			const txn = await repo.findById("txn-1");

			expect(txn).not.toBeNull();
			expect(Decimal.isDecimal(txn!.amount)).toBe(true);
			expect(txn!.amount.toString()).toBe("12.34");
			expect(txn!.reportingAmount).not.toBeNull();
			expect(Decimal.isDecimal(txn!.reportingAmount!)).toBe(true);
			expect(txn!.reportingAmount!.toString()).toBe("12340.0014");
		});

		it("projects reportingAmount=null cleanly when the row carries no FX conversion", async () => {
			vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
				fakeRow({
					reportingAmount: null,
				}) as never,
			);

			const repo = new PrismaTransactionRepository();
			const txn = await repo.findById("txn-1");

			expect(txn!.reportingAmount).toBeNull();
			expect(txn!.reportingCurrencyCode).toBeNull();
			expect(txn!.fxRateId).toBeNull();
		});
	});
});
