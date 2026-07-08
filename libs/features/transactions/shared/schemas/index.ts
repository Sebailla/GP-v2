/**
 * Public barrel for `@features/transactions/shared/schemas`.
 *
 * Re-exports the five canonical Zod schemas for transactions and
 * categories, plus their inferred TS types. The bar
 * `no-schemas-outside-shared` enforces that no other module under
 * `libs/features/transactions/**` declares a Zod `z.object(...)`
 * literal — every schema must live here and be imported by both the
 * NestJS pipe and the Next.js form.
 */

export { createSchema, type CreateTransactionInput } from "./create.js";
export { updateSchema, type UpdateTransactionInput } from "./update.js";
export { listSchema, type ListTransactionsQuery } from "./list.js";
export {
  categoryCreateSchema,
  type CreateCategoryInput,
} from "./category-create.js";
export {
  categoryUpdateSchema,
  type UpdateCategoryInput,
} from "./category-update.js";
