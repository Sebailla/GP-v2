/**
 * Public API of @features/transactions.
 *
 * Slice 5 PR #1 shipped the type layer:
 *  - Re-exports the canonical Zod schemas from `../shared/schemas/`
 *    so callers can `import { createSchema } from "@features/transactions"`.
 *  - Re-exports the six domain ports and the five entities from
 *    `domain/entities/` and `domain/interfaces/`.
 *
 * Slice 5 PR #2 (T5.7 + T5.8 + T5.10) adds the persistence boundary:
 *  - Five `Prisma*Repository` classes implementing the domain ports.
 *  - `InMemoryFxRateProvider`, the default `FxRateProvider` for dev/test.
 *    **Dev/test only** — production adapters (HTTP-backed, cache-aware)
 *    must replace this binding in `TransactionsModule.useFactory`.
 *    Importing the concrete class directly in production code is a
 *    silent smell: the seeded rates are hard-coded and stale. Prefer
 *    importing the `FxRateProvider` port + `FX_RATE_PROVIDER_TOKEN` and
 *    letting the NestJS container resolve the binding.
 *  - `FX_RATE_PROVIDER_TOKEN`, the DI token bound in
 *    `apps/api/src/modules/transactions/transactions.module.ts`.
 *  - The four domain error classes that translate Prisma's
 *    `P2002` / `P2025` runtime codes into domain-friendly errors.
 *
 * Slice 5 PR #3a (T5.9 partial) adds the four services
 * (TransactionService, CategoryService, TotalsService,
 * ThresholdService) + the AuditLogRepository port. The NestJS
 * controller (T5.11) and the triangulation suite (T5.12) land
 * in PR #3b.
 */

// Shared Zod schemas (the canonical source of truth — both NestJS pipe and
// Next.js form reach in here). The Zod-inferred types are the
// public API for HTTP request bodies; the controller maps the
// validated request to the service's `CreateTransactionInput`
// (Decimal-typed, not re-exported to avoid a name collision).
export {
  createSchema,
  updateSchema,
  listSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  type CreateTransactionInput,
  type UpdateTransactionInput,
  type ListTransactionsQuery,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "../../shared/schemas/index.js";

// DI tokens.
export { FX_RATE_PROVIDER_TOKEN, type FxRateProviderToken } from "./constants.js";

// Domain entities + ports (the type layer; PR #3a brings the services).
export type {
  Currency,
  Category,
  CategoryKind,
  Transaction,
  TransactionKind,
  TransactionListItem,
  FxRate,
  FxRateInsert,
  IdempotencyKey,
  IdempotencyKeyInsert,
  AuditLog,
  AuditLogAppend,
  AuditEntityType,
  AuditAction,
} from "./domain/entities/index.js";

export type {
  CategoryRepository,
  CategoryFilter,
  CategoryCreate,
  CategoryUpdate,
  TransactionRepository,
  TransactionListFilter,
  TransactionCreate,
  TransactionUpdate,
  CurrencyRepository,
  FxRateRepository,
  IdempotencyRepository,
  AuditLogRepository,
  FxRateProvider,
  DuplicateIdempotencyKeyError,
} from "./domain/interfaces/index.js";

// Persistence boundary — Prisma adapters (T5.7).
// Each class implements its port and enforces the D-TX-5 soft-delete
// invariant on every read path. Error classes translate Prisma's
// runtime P2002 / P2025 codes into domain-friendly errors.
export {
  PrismaCategoryRepository,
  CategoryAlreadyExistsError,
  CategoryNotFoundError,
} from "./infrastructure/repositories/prisma-category.repository.js";

export { PrismaCurrencyRepository } from "./infrastructure/repositories/prisma-currency.repository.js";

export { PrismaFxRateRepository } from "./infrastructure/repositories/prisma-fx-rate.repository.js";

export { PrismaIdempotencyRepository } from "./infrastructure/repositories/prisma-idempotency.repository.js";

export { PrismaAuditLogRepository } from "./infrastructure/repositories/prisma-audit-log.repository.js";

export {
  PrismaTransactionRepository,
  TransactionNotFoundError,
} from "./infrastructure/repositories/prisma-transaction.repository.js";

// Live FX rate provider (T5.8) — bound through `FX_RATE_PROVIDER_TOKEN`.
// Dev/test impl; production swaps this binding in the NestJS module.
export { InMemoryFxRateProvider } from "./infrastructure/fx/in-memory-fx-rate.provider.js";
export { PrismaUnitOfWork } from "./infrastructure/unit-of-work/prisma-unit-of-work.js";

// Domain services (T5.9, PR #3a) — the orchestrator + the three
// supporting services. The controller (PR #3b) wires these into the
// NestJS container; tests construct them with hand-rolled mocks.
// Note: `CategoryNotFoundError` lives in the category port (above);
// not re-exported here to avoid a name collision.
export {
  TransactionService,
  CategoryService,
  TotalsService,
  ThresholdService,
  DEFAULT_THRESHOLD_AMOUNT,
  IdempotencyKeyReusedError,
  UnsupportedCurrencyPairError,
} from "./domain/services/index.js";
export type {
  TransactionServiceContext,
  CategoryServiceContext,
  CreateTransactionInput as CreateTransactionCommand,
  TotalsRange,
  UserTotals,
  CategoryTotal,
  ThresholdConfig,
} from "./domain/services/index.js";
