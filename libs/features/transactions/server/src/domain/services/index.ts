/**
 * Public barrel for the transactions domain services.
 *
 * Re-exports the four services shipped in slice 5 PR #3a (T5.9):
 *   - `TransactionService` — orchestrator (create + update +
 *     softDelete; idempotency-key atomic replay; FX lookup with
 *     staleness dispatch; audit log; event dispatch).
 *   - `CategoryService` — Category write paths (the read paths
 *     delegate straight to the repository; D-TX-5 enforced there).
 *   - `TotalsService` — sign-aware income / expense / net totals
 *     + per-category breakdown over a user's transactions.
 *   - `ThresholdService` — `transactions.threshold.exceeded`
 *     evaluation. Dispatched AFTER `TransactionService.create`
 *     returns; the service does not block the write.
 *
 * Each service takes its port dependencies via constructor injection
 * (Pattern A, per the auth slice convention from slice 3 batch 6).
 * The slice-level barrel in `src/index.ts` re-exports the symbols
 * consumers need; tests construct services with hand-rolled mocks.
 */
export { CategoryService } from "./category.service.js";
export type { CategoryServiceContext } from "./category.service.js";
export { TransactionService } from "./transaction.service.js";
export type { CreateTransactionInput, TransactionServiceContext } from "./transaction.service.js";
export { IdempotencyKeyReusedError, UnsupportedCurrencyPairError } from "./transaction.service.js";
export { TotalsService } from "./totals.service.js";
export type { TotalsRange, UserTotals, CategoryTotal } from "./totals.service.js";
export { ThresholdService, DEFAULT_THRESHOLD_AMOUNT } from "./threshold.service.js";
export type { ThresholdConfig } from "./threshold.service.js";
