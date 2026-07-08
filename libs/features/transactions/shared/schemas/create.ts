import { z } from "zod";

/**
 * Canonical Zod schema for `POST /transactions` request body.
 *
 * Lives at `libs/features/transactions/shared/schemas/create.ts` per
 * design §5.5 and the slice-wide ESLint rule `no-schemas-outside-shared`.
 * The same schema is consumed by:
 *  - The NestJS `TransactionsController` (apps/api/modules/transactions/)
 *    through `ZodValidationPipe`.
 *  - The Next.js `CreateTransactionForm` (slice 6) through
 *    `@hookform/resolvers/zod`.
 *
 * Boundary contract (mirrors design §5.5 verbatim):
 *  - amount: positive, multiple of 0.01 (cents granularity).
 *  - currencyCode: ISO 4217 alphabetic code, exactly 3 chars.
 *  - kind: 'income' | 'expense'.
 *  - categoryId: cuid (Prisma's default id format).
 *  - notes: optional, max 500 chars.
 *  - occurredAt: ISO 8601 date string, coerced to Date.
 */
export const createSchema = z.object({
  amount: z.coerce.number().positive().multipleOf(0.01),
  currencyCode: z.string().length(3),
  kind: z.enum(["income", "expense"]),
  categoryId: z.string().cuid(),
  notes: z.string().max(500).optional(),
  occurredAt: z.coerce.date(),
});

export type CreateTransactionInput = z.infer<typeof createSchema>;
