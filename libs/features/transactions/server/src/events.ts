import type { DomainEvent } from "@core/events";

/**
 * Transactions-slice event types — slice 5 (PR #3a, T5.9).
 *
 * The five events this slice emits (per design §4.7 + §5.9):
 *
 *   1. `transactions.created` (Pattern A — `TransactionService.create`
 *      dispatches directly via the constructor-injected dispatcher)
 *        Payload: `{ transactionId, userId, amount, currency, occurredAt }`
 *
 *   2. `transactions.updated` (Pattern A —
 *      `TransactionService.update` dispatches directly)
 *        Payload: `{ transactionId, userId, changedFields, at }`
 *
 *   3. `transactions.soft-deleted` (Pattern A —
 *      `TransactionService.softDelete` dispatches directly)
 *        Payload: `{ transactionId, userId, at }`
 *
 *   4. `transactions.fx.stale` (Pattern A —
 *      `TransactionService.create` dispatches when the FX rate is
 *      older than 24h. D-TX-4 mandates that staleness does NOT
 *      block the write — the event is informational; downstream
 *      subscribers (audit, notification, toast) decide policy.)
 *        Payload: `{ from, to, recordedAt, observedAt, ageHours }`
 *
 *   5. `transactions.threshold.exceeded` (Pattern A —
 *      `ThresholdService.evaluate` dispatches when the absolute
 *      amount exceeds the configured threshold)
 *        Payload: `{ userId, categoryId, threshold, total, observedAt }`
 *
 * Pattern A everywhere (mirrors the auth slice, slice 3 batch 6):
 * each service takes the dispatcher in its constructor and dispatches
 * directly. There is no global "wire after construction" step.
 *
 * The five events above are validated by the canonical Zod payload
 * schemas in `libs/core/events/src/types.ts`; this file is a consumer,
 * not the source of truth.
 */

/**
 * The dispatcher contract this slice assumes. Matches the `.dispatch`
 * method of `InMemoryDispatcher` from `@core/events`; tests inject a
 * `vi.fn()` with the same shape.
 */
export type TransactionsEventDispatcher = (event: DomainEvent) => Promise<void> | void;
