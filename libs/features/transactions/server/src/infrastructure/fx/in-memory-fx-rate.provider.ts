import { type Decimal, toDecimal } from "@shared-utils/decimal";

import type { FxRateProvider } from "../../domain/interfaces/fx-rate.provider.js";

/**
 * Currency pair seeded at startup. The provider stores both (from, to)
 * and (to, from) so callers can ask either direction without runtime
 * inversion (which risks fee/precision asymmetry per the standard
 * quote-bid market practice; per spec `USD→ARS ≠ 1 / (ARS→USD)`).
 */
interface SeededPair {
	readonly from: string;
	readonly to: string;
	readonly rate: Decimal;
	readonly recordedAt: Date;
}

/**
 * Default `FxRateProvider` implementation per design §5.2 (D-TX-2).
 *
 * **Dev / test implementation.** The 4R review (review-risk WARNING)
 * flagged that this class is exported via the slice's public barrel
 * (`@features/transactions`) alongside the `FxRateProvider` port and
 * the `FX_RATE_PROVIDER_TOKEN` DI token. A production consumer that
 * imports the wrong symbol gets the hard-coded seeded rates
 * (`1000.001`, `1050.5`, etc.) silently. Mitigation: this doc marks
 * the class as dev/test only, and the slice's barrel JSDoc flags the
 * same. Production adapters (HTTP-backed, cache-aware) MUST replace
 * this binding in the `TransactionsModule.useFactory` without
 * touching the slice's domain code.
 *
 * Seeded at construction time with the four pairs the spec mandates:
 *   USD → ARS, EUR → ARS, ARS → USD, ARS → EUR.
 *
 * `advanceClock(deltaMs)` is a TEST-ONLY helper that bumps the recorded
 * timestamp forward in time — used by integration tests to drive the
 * 24h staleness boundary (design §5.2 + D-TX-4) without sleeping the
 * test runner for 24 hours. Production code NEVER calls it.
 *
 * Staleness policy: the provider returns the rate + recordedAt
 * unchanged; the SERVICE consumer (PR #3's `TransactionService.create`)
 * compares `now - recordedAt > 24h` and emits `transactions.fx.stale`
 * if true (D-TX-4). The provider stays a pure lookup; staleness is
 * a downstream concern (see the port JSDoc).
 */
export class InMemoryFxRateProvider implements FxRateProvider {
	private readonly pairs: Map<string, SeededPair>;

	constructor(seededAt: Date = new Date()) {
		this.pairs = new Map();
		const seeds: ReadonlyArray<readonly [string, string, string]> = [
			// [from, to, rate-as-string]. The ToCurrency is the "denominator".
			// (Strings here are decimal.js-friendly: "1000.001" means
			// `1000.001` exact, no IEEE-754 drift.)
			["USD", "ARS", "1000.001"],
			["EUR", "ARS", "1050.5"],
			["ARS", "USD", "0.000999999"],
			["ARS", "EUR", "0.000951884"],
		];
		for (const [from, to, rateStr] of seeds) {
			this.pairs.set(`${from}->${to}`, {
				from,
				to,
				rate: toDecimal(rateStr),
				recordedAt: seededAt,
			});
		}
	}

	async getRate(
		fromCode: string,
		toCode: string,
	): Promise<{ rate: Decimal; recordedAt: Date } | null> {
		if (fromCode === toCode) {
			// Same-currency is a service-layer concern (D-TX-3); the provider
			// simply returns null and lets the caller short-circuit. The port
			// contract says "returns null for unknown pairs" — same-currency is
			// a degenerate "pair" and the service handles it explicitly.
			return null;
		}
		const pair = this.pairs.get(`${fromCode}->${toCode}`);
		if (pair === undefined) return null;
		return { rate: pair.rate, recordedAt: pair.recordedAt };
	}

	/**
	 * TEST-ONLY: advances the recordedAt timestamp on every seeded pair
	 * by `deltaMs`. Use `advanceClock(25 * 60 * 60 * 1000)` to push the
	 * pair past the 24h staleness window (D-TX-4 + design §5.2).
	 *
	 * Returns the new recordedAt timestamp that was just written to the
	 * last updated pair. The contract was previously mis-documented as
	 * "for chaining" returning `new Date()` (now); the 4R review fix
	 * returns the actual last-written recordedAt so callers can assert
	 * against the deterministic value.
	 */
	advanceClock(deltaMs: number): Date {
		// Initialize from the first pair's recordedAt (the map is seeded
		// at construction time, so values().next() is always defined for
		// the canonical 4-pair seed). The `!` non-null assertion was
		// removed in the 4R fix — we now guard against the empty-provider
		// case explicitly (e.g. a future test refactor that builds a
		// provider without seeding).
		const firstPair = this.pairs.values().next().value;
		if (firstPair === undefined) {
		throw new Error("InMemoryFxRateProvider: cannot advanceClock on empty provider");
		}
		let lastRecordedAt: Date = firstPair.recordedAt;
		for (const [key, pair] of this.pairs) {
		const bumped = new Date(pair.recordedAt.getTime() + deltaMs);
		lastRecordedAt = bumped;
		this.pairs.set(key, {
		...pair,
		recordedAt: bumped,
		});
		}
		return lastRecordedAt;
	}
}
