/**
 * Public barrel for the transactions domain ports.
 *
 * Re-exports the port interfaces shipped across slice 5: category,
 * transaction, currency, fx-rate, idempotency, fx-rate-provider, and
 * audit-log — each paired with its input/filter shapes.
 *
 * The Prisma adapters (PR #2 / T5.7) and the InMemory FX provider
 * (PR #2 / T5.8) implement these ports; the services (PR #3 / T5.9)
 * and controllers (PR #3 / T5.11) consume them through the service
 * layer.
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
    export {
      DuplicateIdempotencyKeyError,
    } from "./idempotency.repository.js";
    export { CategoryAlreadyExistsError, CategoryNotFoundError } from "./category.repository.js";
    export type { FxRateProvider } from "./fx-rate.provider.js";
    export type { AuditLogRepository } from "./audit-log.repository.js";