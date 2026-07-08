/**
 * Public barrel for the transactions domain ports.
 *
 * Re-exports the six port interfaces shipped in PR #1:
 *   - `CategoryRepository`, `TransactionRepository`, `CurrencyRepository`,
 *     `FxRateRepository`, `IdempotencyRepository`, `FxRateProvider`
 *
 * Each is paired with its input/filter shapes. The Prisma adapters
 * (PR #2 / T5.7) and the InMemory FX provider (PR #2 / T5.8) implement
 * these ports; the services (PR #3 / T5.9) and controllers (PR #3 /
 * T5.11) consume them through the service layer.
 *
 * **Note: `AuditLogRepository` is NOT in this barrel.** Tracked as
 * `slice5_pr1_audit_log_port_deferred_to_pr3` in `apply-progress.md`;
 * the port lands alongside the services in PR #3.
 */
export type {
  CategoryRepository,
  CategoryFilter,
  CategoryCreate,
  CategoryUpdate,
} from "./category.repository.js";
export type {
  TransactionRepository,
  TransactionListFilter,
  TransactionCreate,
  TransactionUpdate,
} from "./transaction.repository.js";
export type { CurrencyRepository } from "./currency.repository.js";
export type {
  FxRateRepository,
} from "./fx-rate.repository.js";
export type { IdempotencyRepository } from "./idempotency.repository.js";
export type { FxRateProvider } from "./fx-rate.provider.js";