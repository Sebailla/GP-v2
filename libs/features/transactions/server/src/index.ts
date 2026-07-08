/**
 * Public API of @features/transactions.
 *
 * Slice 5 PR #1 (this commit) ships the type layer only:
 *  - Re-exports the canonical Zod schemas from `../shared/schemas/`
 *    so callers can `import { createSchema } from "@features/transactions"`.
 *  - Re-exports the six domain ports and the five entities from
 *    `domain/entities/` and `domain/interfaces/`.
 *
 * Slice 5 PR #2 adds the Prisma adapters (T5.7 + T5.8) and the
 * FX_RATE_PROVIDER DI wiring (T5.10).
 *
 * Slice 5 PR #3 adds the four services (TransactionService, CategoryService,
 * TotalsService, ThresholdService — T5.9), the NestJS controller
 * (T5.11), and the triangulation suite (T5.12).
 */

// Shared Zod schemas (the canonical source of truth — both NestJS pipe and
// Next.js form reach in here).
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
