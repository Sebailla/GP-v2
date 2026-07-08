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

vi.mock("@core/database", () => ({
	prisma: {
		category: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
	},
}));

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
		it("translates Prisma's P2025 (row not found) into `CategoryNotFoundError`", async () => {
			vi.mocked(prisma.category.update).mockRejectedValue({
				code: "P2025",
			} as never);

			const repo = new PrismaCategoryRepository();
			await expect(
				repo.update("cat-missing", { name: "New Name" }),
			).rejects.toBeInstanceOf(CategoryNotFoundError);
		});
	});

	describe("softDelete", () => {
		it("swallows Prisma's P2025 silently (idempotent)", async () => {
			vi.mocked(prisma.category.update).mockRejectedValue({
				code: "P2025",
			} as never);

			const repo = new PrismaCategoryRepository();
			// MUST NOT throw — soft-deleting an already-deleted (or missing)
			// row is a no-op.
			await expect(
				repo.softDelete("cat-missing", "user-1"),
			).resolves.toBeUndefined();
		});

		it("calls update with `deletedAt: Date, updatedBy: actorId`", async () => {
			vi.mocked(prisma.category.update).mockResolvedValue({} as never);

			const repo = new PrismaCategoryRepository();
			await repo.softDelete("cat-1", "user-42");

			expect(prisma.category.update).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.category.update).mock.calls[0] as unknown as [
					{
						where: { id: string };
						data: { deletedAt: Date; updatedBy: string };
					},
				]
			)[0];
			expect(callArg.where.id).toBe("cat-1");
			expect(callArg.data.deletedAt).toBeInstanceOf(Date);
			expect(callArg.data.updatedBy).toBe("user-42");
		});
	});
});
