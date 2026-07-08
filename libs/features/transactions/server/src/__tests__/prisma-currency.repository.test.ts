import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for `PrismaCurrencyRepository` (slice 5 PR #2 — brief T5.7).
 *
 * Per `domain/interfaces/currency.repository.ts` and design §5.1 the
 * currency port exposes two read-only operations against the `Currency`
 * reference table seeded at startup. There is no `create` / `update`
 * / `delete` on the port — currencies are static for the lifetime of
 * the deploy.
 *
 * Test pattern (mirrors `prisma-session.repository.test.ts`):
 * `vi.mock("@core/database")` stubs the singleton; tests assert the
 * Prisma call shape + projection onto the `Currency` row shape.
 */

vi.mock("@core/database", () => ({
	prisma: {
		currency: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
		},
	},
}));

import { prisma } from "@core/database";

describe("PrismaCurrencyRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("findByCode", () => {
		it("looks up by the unique `code` column via `findUnique`", async () => {
			const { PrismaCurrencyRepository } = await import(
				"../infrastructure/repositories/prisma-currency.repository.js"
			);
			vi.mocked(prisma.currency.findUnique).mockResolvedValue({
				code: "USD",
				name: "United States Dollar",
				symbol: "$",
				decimals: 2,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			} as never);

			const repo = new PrismaCurrencyRepository();
			const currency = await repo.findByCode("USD");

			expect(prisma.currency.findUnique).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.currency.findUnique).mock.calls[0] as unknown as [
					{ where: { code: string } },
				]
			)[0];
			expect(callArg.where.code).toBe("USD");

			expect(currency).toEqual({
				code: "USD",
				name: "United States Dollar",
				symbol: "$",
				decimals: 2,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			});
		});

		it("returns null when the code does not match a seeded currency", async () => {
			const { PrismaCurrencyRepository } = await import(
				"../infrastructure/repositories/prisma-currency.repository.js"
			);
			vi.mocked(prisma.currency.findUnique).mockResolvedValue(null as never);

			const repo = new PrismaCurrencyRepository();
			const currency = await repo.findByCode("ZZZ");

			expect(currency).toBeNull();
		});
	});

	describe("list", () => {
		it("returns every seeded currency ordered by `code` ascending", async () => {
			const { PrismaCurrencyRepository } = await import(
				"../infrastructure/repositories/prisma-currency.repository.js"
			);
			vi.mocked(prisma.currency.findMany).mockResolvedValue([
				{
					code: "ARS",
					name: "Argentine Peso",
					symbol: "$",
					decimals: 2,
					createdAt: new Date("2026-01-01T00:00:00.000Z"),
				},
				{
					code: "EUR",
					name: "Euro",
					symbol: "€",
					decimals: 2,
					createdAt: new Date("2026-01-01T00:00:00.000Z"),
				},
				{
					code: "USD",
					name: "United States Dollar",
					symbol: "$",
					decimals: 2,
					createdAt: new Date("2026-01-01T00:00:00.000Z"),
				},
			] as never);

			const repo = new PrismaCurrencyRepository();
			const currencies = await repo.list();

			expect(prisma.currency.findMany).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.currency.findMany).mock.calls[0] as unknown as [
					{ orderBy: { code: "asc" } },
				]
			)[0];
			expect(callArg.orderBy).toEqual({ code: "asc" });

			expect(currencies).toHaveLength(3);
			expect(currencies.map((c) => c.code)).toEqual(["ARS", "EUR", "USD"]);
		});
	});
});
