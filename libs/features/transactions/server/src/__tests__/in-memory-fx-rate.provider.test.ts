import { describe, it, expect } from "vitest";

import { Decimal } from "@shared-utils/decimal";

import { InMemoryFxRateProvider } from "../infrastructure/fx/in-memory-fx-rate.provider.js";

/**
 * TDD contract for `InMemoryFxRateProvider` (slice 5 PR #2 — brief T5.8).
 *
 * The provider is the default `FxRateProvider` implementation per design
 * §5.2 (D-TX-2). It is seeded at construction time with the four pairs
 * the spec mandates, and it exposes `advanceClock(deltaMs)` as a
 * TEST-ONLY helper to drive the 24h staleness boundary (D-TX-4)
 * without sleeping the test runner for 24 hours.
 *
 * The provider is a pure lookup. Staleness is a service-layer concern
 * (PR #3's `TransactionService.create` compares
 * `now - recordedAt > 24h` and emits `transactions.fx.stale` if true).
 */

const SEED = new Date("2026-01-01T00:00:00.000Z");

describe("InMemoryFxRateProvider", () => {
	describe("constructor — 4-pair seed (D-TX-2)", () => {
		it("seeds USD→ARS with rate 1000.001 at the construction timestamp", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const pair = await provider.getRate("USD", "ARS");
			expect(pair).not.toBeNull();
			expect(Decimal.isDecimal(pair!.rate)).toBe(true);
			expect(pair!.rate.toString()).toBe("1000.001");
			expect(pair!.recordedAt.getTime()).toBe(SEED.getTime());
		});

		it("seeds EUR→ARS with rate 1050.5", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const pair = await provider.getRate("EUR", "ARS");
			expect(pair!.rate.toString()).toBe("1050.5");
		});

		it("seeds ARS→USD with rate 0.000999999 (full precision, no IEEE-754 drift)", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const pair = await provider.getRate("ARS", "USD");
			expect(pair!.rate.toString()).toBe("0.000999999");
		});

		it("seeds ARS→EUR with rate 0.000951884", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const pair = await provider.getRate("ARS", "EUR");
			expect(pair!.rate.toString()).toBe("0.000951884");
		});

		it("uses the construction `seededAt` as the recordedAt for every pair", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const usdArs = await provider.getRate("USD", "ARS");
			const eurArs = await provider.getRate("EUR", "ARS");
			expect(usdArs!.recordedAt.getTime()).toBe(SEED.getTime());
			expect(eurArs!.recordedAt.getTime()).toBe(SEED.getTime());
		});

		it("defaults `seededAt` to `new Date()` when not supplied", async () => {
			const before = Date.now();
			const provider = new InMemoryFxRateProvider();
			const after = Date.now();
			const pair = await provider.getRate("USD", "ARS");
			// The recordedAt must fall into the [before, after] window. Tolerance
			// is implicit — we DO NOT pin the exact timestamp (testing-standards
			// anti-pattern "no asserting on timestamps").
			expect(pair!.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
			expect(pair!.recordedAt.getTime()).toBeLessThanOrEqual(after);
		});
	});

	describe("getRate", () => {
		it("returns null for unknown pairs (the provider exposes only 4 seeded pairs)", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const pair = await provider.getRate("USD", "EUR");
			expect(pair).toBeNull();
		});

		it("returns null for same-currency calls (D-TX-3: same-currency is a service-layer concern)", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const usdUsd = await provider.getRate("USD", "USD");
			const arsArs = await provider.getRate("ARS", "ARS");
			expect(usdUsd).toBeNull();
			expect(arsArs).toBeNull();
		});
	});

	describe("advanceClock — TEST-ONLY helper for the 24h staleness boundary (D-TX-4)", () => {
		it("bumps every seeded pair's recordedAt by deltaMs", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const beforeUsdArs = await provider.getRate("USD", "ARS");
			expect(beforeUsdArs!.recordedAt.getTime()).toBe(SEED.getTime());

			const HOURS_25 = 25 * 60 * 60 * 1000;
			provider.advanceClock(HOURS_25);

			const afterUsdArs = await provider.getRate("USD", "ARS");
			const afterEurArs = await provider.getRate("EUR", "ARS");
			const afterArsUsd = await provider.getRate("ARS", "USD");
			const afterArsEur = await provider.getRate("ARS", "EUR");

			// Every pair must be pushed by exactly 25h — the helper is uniform
			// across the seeded set so staleness evaluation stays predictable.
			expect(afterUsdArs!.recordedAt.getTime()).toBe(SEED.getTime() + HOURS_25);
			expect(afterEurArs!.recordedAt.getTime()).toBe(SEED.getTime() + HOURS_25);
			expect(afterArsUsd!.recordedAt.getTime()).toBe(SEED.getTime() + HOURS_25);
			expect(afterArsEur!.recordedAt.getTime()).toBe(SEED.getTime() + HOURS_25);
		});

		it("pushes past the 24h staleness window in a single call (the point of the helper)", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const HOURS_25 = 25 * 60 * 60 * 1000;
			provider.advanceClock(HOURS_25);

			// The semantically meaningful assertion: after the helper bumps the
			// pair by 25h, the pair is older than 24h relative to the ORIGINAL
			// SEED. The service in PR #3 will read `now = new Date()` and
			// compare `now - recordedAt > 24h`; this test pins the
			// boundary-shape (recordedAt < SEED + 24h would fail, recordedAt >
			// SEED + 24h succeeds). We assert the SECOND inequality.
			const pair = await provider.getRate("USD", "ARS");
			const ageMsFromSeed = pair!.recordedAt.getTime() - SEED.getTime();
			expect(ageMsFromSeed).toBeGreaterThan(24 * 60 * 60 * 1000);
		});

		it("supports calling advanceClock multiple times (cumulative)", async () => {
			const provider = new InMemoryFxRateProvider(SEED);
			const HOUR = 60 * 60 * 1000;
			provider.advanceClock(HOUR);
			provider.advanceClock(HOUR);
			provider.advanceClock(HOUR);

			const pair = await provider.getRate("USD", "ARS");
			expect(pair!.recordedAt.getTime()).toBe(SEED.getTime() + 3 * HOUR);
		});
	});
});
