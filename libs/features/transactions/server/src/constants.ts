/**
 * DI tokens + policy constants for the transactions feature slice.
 *
 * The DI tokens live in the slice (not in `apps/api`) so consumers
 * import a const, not a string literal. This keeps the convention
 * honest and prevents string drift across bound surfaces — NestJS
 * modules and services both reach for the same identifier.
 *
 * Policy constants (D-TX-4 staleness window + D-TX-1 idempotency
 * TTL) live here too so the service + adapter + tests can all
 * reference the same canonical values.
 */

/**
 * Inversion-of-control token used by NestJS to resolve the live FX rate
 * provider (`FxRateProvider` port) inside `TransactionsModule`. Resolves
 * to the canonical `InMemoryFxRateProvider` in development + tests; a
 * real adapter (HTTP-backed, cache-aware) can replace it without
 * touching the slice's domain code.
 */
export const FX_RATE_PROVIDER_TOKEN = "FX_RATE_PROVIDER" as const;

/**
 * Compile-time alias for the token literal. Useful in tests + service
 * decorators where the literal narrowing is needed.
 */
export type FxRateProviderToken = typeof FX_RATE_PROVIDER_TOKEN;

/**
 * D-TX-4: a quoted FX rate is "stale" when its `recordedAt` is older
 * than this window. The `TransactionService.create` path emits
 * `transactions.fx.stale` (informational, NOT a write blocker) when
 * the rate's age exceeds this window. 24 hours matches the
 * conventional daily-refresh cycle for major currency pairs.
 */
export const STALENESS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * D-TX-1: the time-to-live for a cached idempotency record. After
 * this window, a `(userId, key)` tuple is treated as fresh (the
 * `find()` boundary check returns `null` for expired rows). Matches
 * the spec's 1-hour convention.
 */
export const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

/**
 * Configuration threshold for `ThresholdService.evaluate` — the
 * absolute amount (in the transaction's currency) above which the
 * service dispatches `transactions.threshold.exceeded`. Slice
 * default is 1000.00; production deployments override per
 * `Category.threshold` once that field lands (slice 6+).
 */
export const DEFAULT_THRESHOLD_AMOUNT = "1000";
