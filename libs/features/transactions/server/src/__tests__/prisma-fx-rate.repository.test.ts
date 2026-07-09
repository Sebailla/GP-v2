import { describe, it, expect, vi, beforeEach } from "vitest";

import { Decimal, toDecimal } from "@shared-utils/decimal";

/**
 * TDD contract for `PrismaFxRateRepository` (slice 5 PR #2 — brief T5.7).
 *
 * The FX rate adapter is the cold-path persistent store for ingested FX
 * quotes. The hot read path for live conversions goes through
 * `FxRateProvider` (see `in-memory-fx-rate.provider.test.ts`).
 *
 * Decimal boundary (D-TX-6) — the adapter owns the two-sided conversion
 * between the domain `Decimal` (decimal.js) and Prisma's runtime
 * `Decimal` (separate class). Outbound: `rate.toString()`. Inbound:
 * `row.rate.toString()` re-parsed via `toDecimal`. The tests assert
 * both sides explicitly because `tsc` does NOT catch a missing
 * conversion (the types align at both ends).
 *
 * Test pattern (mirrors `prisma-session.repository.test.ts`):
 * `vi.mock("@core/database")` stubs the singleton.
 */

vi.mock("@core/database", () => ({
	prisma: {
		fxRate: {
			findFirst: vi.fn(),
			create: vi.fn(),
		},
	},
}));

import { prisma } from "@core/database";

describe("PrismaFxRateRepository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("findMostRecent", () => {
		it("returns the most recent rate for the (fromCode, toCode) pair ordered by recordedAt desc", async () => {
			const { PrismaFxRateRepository } = await import(
				"../infrastructure/repositories/prisma-fx-rate.repository.js"
			);
			vi.mocked(prisma.fxRate.findFirst).mockResolvedValue({
				id: "fx-1",
				fromCode: "USD",
				toCode: "ARS",
				rate: { toString: () => "1000.001" },
				recordedAt: new Date("2026-06-01T12:00:00.000Z"),
			} as never);

			const repo = new PrismaFxRateRepository();
			const rate = await repo.findMostRecent("USD", "ARS");

			expect(prisma.fxRate.findFirst).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.fxRate.findFirst).mock.calls[0] as unknown as [
					{
						where: { fromCode: string; toCode: string };
						orderBy: { recordedAt: "desc" };
					},
				]
			)[0];
			expect(callArg.where).toEqual({ fromCode: "USD", toCode: "ARS" });
			expect(callArg.orderBy).toEqual({ recordedAt: "desc" });

			expect(rate).not.toBeNull();
			expect(rate!.fromCode).toBe("USD");
			expect(rate!.toCode).toBe("ARS");
			expect(rate!.rate.toString()).toBe("1000.001");
			expect(rate!.recordedAt).toBeInstanceOf(Date);
		});

		it("returns null when no rate has been ingested for the pair", async () => {
			const { PrismaFxRateRepository } = await import(
				"../infrastructure/repositories/prisma-fx-rate.repository.js"
			);
			vi.mocked(prisma.fxRate.findFirst).mockResolvedValue(null as never);

			const repo = new PrismaFxRateRepository();
			const rate = await repo.findMostRecent("USD", "BTC");

			expect(rate).toBeNull();
		});
	});

	describe("insert", () => {
		it("serializes the domain `Decimal` rate to its `toString()` form (not a JS number)", async () => {
			const { PrismaFxRateRepository } = await import(
				"../infrastructure/repositories/prisma-fx-rate.repository.js"
			);
			vi.mocked(prisma.fxRate.create).mockResolvedValue({
				id: "fx-new",
				fromCode: "USD",
				toCode: "EUR",
				rate: { toString: () => "1.0823" },
				recordedAt: new Date("2026-06-02T00:00:00.000Z"),
			} as never);

			const repo = new PrismaFxRateRepository();
			await repo.insert({
				fromCode: "USD",
				toCode: "EUR",
				rate: toDecimal("1.0823"),
				recordedAt: new Date("2026-06-02T00:00:00.000Z"),
			});

			expect(prisma.fxRate.create).toHaveBeenCalledTimes(1);
			const callArg = (
				vi.mocked(prisma.fxRate.create).mock.calls[0] as unknown as [
					{
						data: {
							fromCode: string;
							toCode: string;
							rate: string;
							recordedAt: Date;
						};
					},
				]
			)[0];
			// CRITICAL: must be a string, not a Decimal instance — Prisma
			// serializes the numeric column from the string repr.
			expect(typeof callArg.data.rate).toBe("string");
			expect(callArg.data.rate).toBe("1.0823");
			expect(callArg.data.fromCode).toBe("USD");
			expect(callArg.data.toCode).toBe("EUR");
			expect(callArg.data.recordedAt).toBeInstanceOf(Date);
		});
	});

	describe("Decimal boundary (inbound projection)", () => {
		it("re-parses Prisma's runtime Decimal into the domain Decimal via .toString()", async () => {
			const { PrismaFxRateRepository } = await import(
				"../infrastructure/repositories/prisma-fx-rate.repository.js"
			);
			// Simulate the row shape: Prisma's runtime Decimal emits a toString() that
			// matches the precision of the underlying numeric column.
			const fakePrismaDecimal = { toString: () => "1000.001" };
			vi.mocked(prisma.fxRate.findFirst).mockResolvedValue({
				id: "fx-1",
				fromCode: "USD",
				toCode: "ARS",
				rate: fakePrismaDecimal,
				recordedAt: new Date("2026-06-01T12:00:00.000Z"),
			} as never);

			const repo = new PrismaFxRateRepository();
			const rate = await repo.findMostRecent("USD", "ARS");

			// The projection must yield a domain `Decimal` (decimal.js class),
			// NOT the Prisma runtime Decimal. We assert via `Decimal.isDecimal`
			// (decimal.js API).
			expect(rate).not.toBeNull();
			expect(Decimal.isDecimal(rate!.rate)).toBe(true);
			expect(rate!.rate.toString()).toBe("1000.001");
		});
	});
});
