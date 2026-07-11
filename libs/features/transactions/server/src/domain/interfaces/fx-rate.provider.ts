import type { Decimal } from "@shared-utils/decimal";

/**
 * Domain port for live FX rate lookup (D-TX-2).
 *
 * Two implementations live in the project:
 *  - `infrastructure/fx/in-memory-fx-rate.provider.ts` (PR #2 / T5.8):
 *    the default implementation for the reference repo. Seeded at
 *    startup with USD→ARS, EUR→ARS, ARS→USD, ARS→EUR pairs; carries
 *    `advanceClock()` for tests so the 24h staleness window is
 *    exercise-able.
 *  - (future) `infrastructure/fx/external-fx-rate.provider.ts`:
 *    adapter against a real rate feed; out of scope for the reference
 *    repo (per AGENTS.md §11).
 *
 * The port is intentionally narrow: one method, two parameters, one
 * nullable return shape. Staleness is reported via `recordedAt` —
 * callers (`TransactionService.create`) compare it to `now()` and emit
 * `transactions.fx.stale` if the gap exceeds 24h (D-TX-4).
 */
export interface FxRateProvider {
  /**
   * Look up the current rate from `fromCode` to `toCode`. Returns
   * `null` if the pair is unknown. `recordedAt` is the timestamp the
   * rate was recorded at; staleness is a downstream concern.
   */
  getRate(fromCode: string, toCode: string): Promise<{ rate: Decimal; recordedAt: Date } | null>;
}
