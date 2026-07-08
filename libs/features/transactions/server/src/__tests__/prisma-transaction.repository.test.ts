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

vi.mock("@core/database", async () => {
	const actual = await vi.importActual<typeof import("@core/database")>("@core/database");
	const transaction = {
		findFirst: vi.fn(),
		findMany: vi.fn(),
		count: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
	};
	return {
		...actual,
		prisma: {
			transaction,
			// The $transaction wrapper accepts a callback that receives a
			// transaction client (`tx`). We forward the calls to the same
			// mock surface so the existing assertions keep working without
			// duplicating mocks. The D-TX-5 SERIALIZABLE contract in
			// PrismaCategoryRepository.update + PrismaTransactionRepository.update
			// runs the pre-check + the update inside this transaction.
			$transaction: vi.fn(
				async (
					fn: (tx: { transaction: typeof transaction }) => unknown,
				) => fn({ transaction }),
			),
		},
	};
});

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
    		it("translates a missing pre-check row into `TransactionNotFoundError` (D-TX-5 invariant)", async () => {
    		// The pre-check `findFirst({ id, deletedAt: null })` returns null
    		// when the row is missing OR already soft-deleted. The adapter
    		// throws NotFoundError BEFORE the update is attempted.
    		vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

    		const repo = new PrismaTransactionRepository();
    		await expect(
    		repo.update("txn-missing", { updatedBy: "user-1" }),
    		).rejects.toBeInstanceOf(TransactionNotFoundError);
    		// The update is NEVER attempted when the pre-check fails.
    		expect(prisma.transaction.update).not.toHaveBeenCalled();
    		});

    		it("refuses to update soft-deleted rows (D-TX-5 — pre-check filters on deletedAt: null)", async () => {
    		vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

    		const repo = new PrismaTransactionRepository();
    		await expect(
    		repo.update("txn-soft-deleted", { updatedBy: "user-1" }),
    		).rejects.toBeInstanceOf(TransactionNotFoundError);
    		expect(prisma.transaction.update).not.toHaveBeenCalled();
    		});

    		it("calls findFirst with `where: { id, deletedAt: null }` on the pre-check", async () => {
    		vi.mocked(prisma.transaction.findFirst).mockResolvedValue(fakeRow() as never);
    		vi.mocked(prisma.transaction.update).mockResolvedValue(fakeRow() as never);

    		const repo = new PrismaTransactionRepository();
    		await repo.update("txn-1", { updatedBy: "user-1" });

    		expect(prisma.transaction.findFirst).toHaveBeenCalledTimes(1);
    		const findCallArg = (
    		vi.mocked(prisma.transaction.findFirst).mock.calls[0] as unknown as [
    		{ where: { id: string; deletedAt: null } },
    		]
    		)[0];
    		// D-TX-5 invariant: the pre-check MUST filter `deletedAt: null`.
    		expect(findCallArg.where.id).toBe("txn-1");
    		expect(findCallArg.where.deletedAt).toBeNull();
    		});

    		it("wraps the pre-check + update in a SERIALIZABLE transaction (4R review fix)", async () => {
    		vi.mocked(prisma.transaction.findFirst).mockResolvedValue(fakeRow() as never);
    		vi.mocked(prisma.transaction.update).mockResolvedValue(fakeRow() as never);

    		const repo = new PrismaTransactionRepository();
    		await repo.update("txn-1", { updatedBy: "user-1" });

    		// $transaction must be called exactly once for the update path,
    		// and the isolation level MUST be Serializable — without it, a
    		// concurrent softDelete could land between the pre-check and
    		// the update, violating D-TX-5.
    		const $transaction = vi.mocked(prisma.$transaction);
    		expect($transaction).toHaveBeenCalledTimes(1);
    		const txCallArg = $transaction.mock.calls[0] as unknown as [
    		(tx: unknown) => unknown,
    		{ isolationLevel: string | { Serializable: string } },
    		];
    		expect(typeof txCallArg[0]).toBe("function");
    		// `TransactionIsolationLevel.Serializable` is the runtime enum
    		// entry, which is the string "Serializable". The 4R review
    		// contract: the update path MUST run at Serializable isolation
    		// so a concurrent softDelete cannot land between the pre-check
    		// and the update.
    		expect(txCallArg[1].isolationLevel).toBe("Serializable");
    		});

    		it("serializes a patched `amount` via .toString()", async () => {
    		vi.mocked(prisma.transaction.findFirst).mockResolvedValue(fakeRow() as never);
    		vi.mocked(prisma.transaction.update).mockResolvedValue(fakeRow() as never);

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

    	describe("create — P2002 translation (forward-looking guard)", () => {
    		it("translates a P2002 unique-constraint violation into `TransactionAlreadyExistsError`", async () => {
    		// Today the schema has no `@@unique(...)` on Transaction, but the
    		// translation is wired now so a future unique constraint cannot leak
    		// the raw Prisma error. We mock the Prisma P2002 shape that the
    		// shared `isPrismaUniqueViolation` helper recognizes (target as
    		// string or string[] both work).
    		vi.mocked(prisma.transaction.create).mockRejectedValue({
    		code: "P2002",
    		meta: { target: "id" },
    		} as never);

    		const { TransactionAlreadyExistsError } = await import(
    		"../infrastructure/repositories/prisma-transaction.repository.js"
    		);
    		const repo = new PrismaTransactionRepository();
    		await expect(
    		repo.create({
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
    		}),
    		).rejects.toBeInstanceOf(TransactionAlreadyExistsError);
    		});

    		it("passes through Prisma errors other than P2002 (no translation)", async () => {
    		vi.mocked(prisma.transaction.create).mockRejectedValue(
    		new Error("connection reset") as never,
    		);

    		const repo = new PrismaTransactionRepository();
    		await expect(
    		repo.create({
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
    		}),
    		).rejects.toThrow("connection reset");
    		});
    	});

    	describe("softDelete", () => {
    		it("is a no-op when the row is missing (updateMany returns count=0; no throw)", async () => {
    		vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 0 } as never);

    		const repo = new PrismaTransactionRepository();
    		await expect(
    		repo.softDelete("txn-missing", "user-1"),
    		).resolves.toBeUndefined();
    		});

    		it("is a no-op when the row is already soft-deleted (updateMany filters on deletedAt: null)", async () => {
    		vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 0 } as never);

    		const repo = new PrismaTransactionRepository();
    		await expect(
    		repo.softDelete("txn-already-deleted", "user-1"),
    		).resolves.toBeUndefined();
    		});

    		it("calls updateMany with `deletedAt: null` filter + `deletedAt: Date, updatedBy: actorId` payload", async () => {
    		vi.mocked(prisma.transaction.updateMany).mockResolvedValue({ count: 1 } as never);

    		const repo = new PrismaTransactionRepository();
    		await repo.softDelete("txn-1", "user-42");

    		expect(prisma.transaction.updateMany).toHaveBeenCalledTimes(1);
    		const callArg = (
    		vi.mocked(prisma.transaction.updateMany).mock.calls[0] as unknown as [
    		{
    		where: { id: string; deletedAt: null };
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
