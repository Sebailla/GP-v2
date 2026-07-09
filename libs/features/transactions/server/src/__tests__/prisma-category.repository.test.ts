import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	CategoryAlreadyExistsError,
	CategoryNotFoundError,
	PrismaCategoryRepository,
} from "../infrastructure/repositories/prisma-category.repository.js";

/**
 * TDD contract for `PrismaCategoryRepository` (slice 5 PR #2 — brief T5.7).
 *
 * The adapter is the persistence boundary for the `Category` aggregate.
 * Its surface mirrors `domain/interfaces/category.repository.ts`, plus
 * two domain error classes that translate Prisma runtime codes
 * (`P2002` unique violation, `P2025` not-found) into domain-friendly
 * error classes.
 *
 * **D-TX-5 soft-delete invariant** — every read query MUST filter
 * `where: { deletedAt: null }`. There is no escape hatch. The test
 * suite asserts the invariant by inspecting every read call's `where`
 * clause and locking in the soft-delete predicate.
 *
 * Test pattern (mirrors `prisma-session.repository.test.ts`):
 * `vi.mock("@core/database")` stubs the singleton.
 */

vi.mock("@core/database", async () => {
	const actual = await vi.importActual<typeof import("@core/database")>("@core/database");
	const category = {
		findFirst: vi.fn(),
		findMany: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
	};
	return {
		...actual,
		prisma: {
			category,
			// The $transaction wrapper accepts a callback that receives a
			// transaction client (`tx`). We forward the calls to the same
			// mock surface so the existing assertions (`prisma.category.findFirst`,
			// `prisma.category.update`) keep working without duplicating mocks.
			$transaction: vi.fn(
				async (fn: (tx: { category: typeof category }) => unknown) =>
					fn({ category }),
			),
		},
	};
});

import { prisma } from "@core/database";

describe("PrismaCategoryRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("findById — D-TX-5", () => {
		it("filters `deletedAt: null` on the read path (no escape hatch)", async () => {
			vi.mocked(prisma.category.findFirst).mockResolvedValue({
				id: "cat-1",
				name: "Groceries",
				slug: "groceries",
				kind: "expense",
				updatedBy: "user-1",
				deletedAt: null,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			} as never);

			const repo = new PrismaCategoryRepository();
			const category = await repo.findById("cat-1");

			expect(prisma.category.findFirst).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.category.findFirst).mock.calls[0] as unknown as [
					{ where: { id: string; deletedAt: null } },
				]
			)[0];
			expect(callArg.where.id).toBe("cat-1");
			// D-TX-5 invariant — the soft-delete predicate MUST be present on
			// every read query, period.
			expect(callArg.where.deletedAt).toBeNull();

			expect(category).not.toBeNull();
			expect(category!.id).toBe("cat-1");
			expect(category!.kind).toBe("expense");
		});

		it("returns null when the row does not exist (or is soft-deleted — same outcome)", async () => {
			vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

			const repo = new PrismaCategoryRepository();
			const category = await repo.findById("cat-missing");

			expect(category).toBeNull();
		});
	});

	describe("list — D-TX-5", () => {
		it("filters `deletedAt: null` and applies the optional `kind` filter", async () => {
			vi.mocked(prisma.category.findMany).mockResolvedValue([] as never);

			const repo = new PrismaCategoryRepository();
			await repo.list({ kind: "expense" });

			expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.category.findMany).mock.calls[0] as unknown as [
					{
						where: { deletedAt: null; kind?: string };
						orderBy: { name: "asc" };
					},
				]
			)[0];
			expect(callArg.where.deletedAt).toBeNull();
			expect(callArg.where.kind).toBe("expense");
			expect(callArg.orderBy).toEqual({ name: "asc" });
		});

		it("filters `deletedAt: null` without any other filter when the filter argument is empty", async () => {
			vi.mocked(prisma.category.findMany).mockResolvedValue([] as never);

			const repo = new PrismaCategoryRepository();
			await repo.list({});

			const callArg = (
				vi.mocked(prisma.category.findMany).mock.calls[0] as unknown as [
					{ where: { deletedAt: null }; orderBy: { name: "asc" } },
				]
			)[0];
			expect(callArg.where).toEqual({ deletedAt: null });
			expect(callArg.orderBy).toEqual({ name: "asc" });
		});
	});

	describe("create", () => {
		it("translates Prisma's P2002 (slug unique) into `CategoryAlreadyExistsError`", async () => {
			vi.mocked(prisma.category.create).mockRejectedValue({
				code: "P2002",
				meta: { target: "slug" },
			} as never);

			const repo = new PrismaCategoryRepository();
			await expect(
				repo.create({ name: "Groceries", slug: "groceries", kind: "expense" }),
			).rejects.toBeInstanceOf(CategoryAlreadyExistsError);
		});

		it("passes through Prisma errors other than P2002 (no translation)", async () => {
			const unexpected = new Error("connection reset");
			vi.mocked(prisma.category.create).mockRejectedValue(unexpected as never);

			const repo = new PrismaCategoryRepository();
			await expect(
				repo.create({ name: "Groceries", slug: "groceries", kind: "expense" }),
			).rejects.toBe(unexpected);
		});

		it("returns the projected Category on success", async () => {
			vi.mocked(prisma.category.create).mockResolvedValue({
				id: "cat-1",
				name: "Groceries",
				slug: "groceries",
				kind: "expense",
				updatedBy: "__category_seed_actor__",
				deletedAt: null,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			} as never);

			const repo = new PrismaCategoryRepository();
			const category = await repo.create({
				name: "Groceries",
				slug: "groceries",
				kind: "expense",
			});

			expect(category.kind).toBe("expense");
			expect(category.slug).toBe("groceries");
		});
	});

    	describe("update", () => {
    		it("throws CategoryNotFoundError when the row is missing (pre-check findFirst returns null)", async () => {
    		// The D-TX-5 pre-check (`findFirst({ where: { id, deletedAt: null } })`)
    		// catches the not-found case before the update is attempted. The
    		// adapter throws the typed error directly; the service layer
    		// translates it.
    		vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    		const repo = new PrismaCategoryRepository();
    		await expect(
    		repo.update("cat-missing", { name: "New Name" }),
    		).rejects.toBeInstanceOf(CategoryNotFoundError);
    		// The update is NEVER attempted when the pre-check fails.
    		expect(prisma.category.update).not.toHaveBeenCalled();
    		});

    		it("translates Prisma's P2034 (serialization failure) to CategoryNotFoundError (4R re-pass)", async () => {
    		// When the SERIALIZABLE $transaction is aborted by a concurrent
    		// softDelete, Prisma surfaces the failure as P2034. The adapter
    		// translates the raw Prisma error into the domain-friendly
    		// CategoryNotFoundError so the service layer never sees a raw
    		// Prisma error on the D-TX-5 update path.
    		vi.mocked(prisma.category.findFirst).mockResolvedValue({
    		id: "cat-1",
    		name: "Groceries",
    		slug: "groceries",
    		kind: "expense",
    		updatedBy: "user-1",
    		deletedAt: null,
    		createdAt: new Date("2026-01-01T00:00:00.000Z"),
    		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    		} as never);
    		vi.mocked(prisma.category.update).mockRejectedValue({
    		code: "P2034",
    		} as never);

    		const repo = new PrismaCategoryRepository();
    		await expect(
    		repo.update("cat-1", { name: "New Name" }),
    		).rejects.toBeInstanceOf(CategoryNotFoundError);
    		});

    		it("refuses to update soft-deleted rows (D-TX-5 invariant — pre-check returns null)", async () => {
    		// The pre-check filters on `deletedAt: null`. A soft-deleted row
    		// returns null from `findFirst`; the adapter throws NotFoundError
    		// and the update is NOT attempted. This is the D-TX-5 invariant
    		// on the update path — soft-deleted rows are immutable through
    		// the adapter's update method.
    		vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    		const repo = new PrismaCategoryRepository();
    		await expect(
    		repo.update("cat-soft-deleted", { name: "New Name" }),
    		).rejects.toBeInstanceOf(CategoryNotFoundError);
    		expect(prisma.category.update).not.toHaveBeenCalled();
    		});

    		it("calls findFirst with `where: { id, deletedAt: null }` on the pre-check", async () => {
    		vi.mocked(prisma.category.findFirst).mockResolvedValue({
    		id: "cat-1",
    		name: "Groceries",
    		slug: "groceries",
    		kind: "expense",
    		updatedBy: "user-1",
    		deletedAt: null,
    		createdAt: new Date("2026-01-01T00:00:00.000Z"),
    		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    		} as never);
    		vi.mocked(prisma.category.update).mockResolvedValue({
    		id: "cat-1",
    		name: "New Name",
    		slug: "groceries",
    		kind: "expense",
    		updatedBy: "__category_seed_actor__",
    		deletedAt: null,
    		createdAt: new Date("2026-01-01T00:00:00.000Z"),
    		updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    		} as never);

    		const repo = new PrismaCategoryRepository();
    		await repo.update("cat-1", { name: "New Name" });

    		expect(prisma.category.findFirst).toHaveBeenCalledTimes(1);
    		const callArg = (
    		vi.mocked(prisma.category.findFirst).mock.calls[0] as unknown as [
    		{ where: { id: string; deletedAt: null } },
    		]
    		)[0];
    		// D-TX-5 invariant: the pre-check MUST filter `deletedAt: null`.
    		expect(callArg.where.id).toBe("cat-1");
    		expect(callArg.where.deletedAt).toBeNull();
    		});

    		it("wraps the pre-check + update in a SERIALIZABLE transaction (4R review fix)", async () => {
    		vi.mocked(prisma.category.findFirst).mockResolvedValue({
    		id: "cat-1",
    		name: "Groceries",
    		slug: "groceries",
    		kind: "expense",
    		updatedBy: "user-1",
    		deletedAt: null,
    		createdAt: new Date("2026-01-01T00:00:00.000Z"),
    		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    		} as never);
    		vi.mocked(prisma.category.update).mockResolvedValue({
    		id: "cat-1",
    		name: "New Name",
    		slug: "groceries",
    		kind: "expense",
    		updatedBy: "__category_seed_actor__",
    		deletedAt: null,
    		createdAt: new Date("2026-01-01T00:00:00.000Z"),
    		updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    		} as never);

    		const repo = new PrismaCategoryRepository();
    		await repo.update("cat-1", { name: "New Name" });

    		// D-TX-5 contract: the pre-check + update run inside a
    		// SERIALIZABLE transaction so a concurrent softDelete cannot
    		// land between the two operations. Without Serializable
    		// isolation, the read-then-update pattern admits a TOCTOU
    		// window where the update lands on a now-soft-deleted row.
    		const $transaction = vi.mocked(prisma.$transaction);
    		expect($transaction).toHaveBeenCalledTimes(1);
    		const txCallArg = $transaction.mock.calls[0] as unknown as [
    		(tx: unknown) => unknown,
    		{ isolationLevel: string | { Serializable: string } },
    		];
    		expect(typeof txCallArg[0]).toBe("function");
    		expect(txCallArg[1].isolationLevel).toBe("Serializable");
    		});
    	});

    	describe("softDelete", () => {
    		it("is a no-op when the row is missing (updateMany returns count=0; no throw)", async () => {
    		// The atomic updateMany replaces the prior `update` + P2025-swallow
    		// pattern. When the row is missing, the count is 0 and the adapter
    		// resolves without throwing.
    		vi.mocked(prisma.category.updateMany).mockResolvedValue({ count: 0 } as never);

    		const repo = new PrismaCategoryRepository();
    		await expect(
    			repo.softDelete("cat-missing", "user-1"),
    		).resolves.toBeUndefined();
    	});

    	it("is a no-op when the row is already soft-deleted (updateMany filters on deletedAt: null)", async () => {
    		// The where: { id, deletedAt: null } filter means an already-deleted
    		// row matches no rows; updateMany returns count: 0; no throw.
    		vi.mocked(prisma.category.updateMany).mockResolvedValue({ count: 0 } as never);

    		const repo = new PrismaCategoryRepository();
    		await expect(
    			repo.softDelete("cat-already-deleted", "user-1"),
    		).resolves.toBeUndefined();
    	});

    	it("calls updateMany with `deletedAt: null` filter + `deletedAt: Date, updatedBy: actorId` payload", async () => {
    		vi.mocked(prisma.category.updateMany).mockResolvedValue({ count: 1 } as never);

    		const repo = new PrismaCategoryRepository();
    		await repo.softDelete("cat-1", "user-42");

    		expect(prisma.category.updateMany).toHaveBeenCalledTimes(1);
    		const callArg = (
    		vi.mocked(prisma.category.updateMany).mock.calls[0] as unknown as [
    		{
    		where: { id: string; deletedAt: null };
    		data: { deletedAt: Date; updatedBy: string };
    		},
    		]
    	)[0];
    		// D-TX-5 invariant: the where filter MUST include `deletedAt: null`
    		// so a concurrent soft-deleted row is not re-mutated.
    		expect(callArg.where.id).toBe("cat-1");
    		expect(callArg.where.deletedAt).toBeNull();
    		expect(callArg.data.deletedAt).toBeInstanceOf(Date);
    		expect(callArg.data.updatedBy).toBe("user-42");
    	});
    });
});
