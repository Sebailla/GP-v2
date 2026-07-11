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
 *  - amount: positive decimal string with at most 2 fractional digits.
 *    The wire format is a STRING (not a JS Number) so JavaScript's
 *    IEEE-754 representation cannot lose precision before the
 *    `toDecimal` conversion (D-TX-6 + R1-003).
 *  - currencyCode: ISO 4217 alphabetic code, exactly 3 chars.
 *  - kind: 'income' | 'expense'.
 *  - categoryId: cuid (Prisma's default id format).
 *  - notes: optional, max 500 chars.
 *  - occurredAt: ISO 8601 date string, coerced to Date.
 */
export const createSchema = z
  .object({
    // R1-003: amount is a decimal STRING so the wire bytes survive
    // until `toDecimal(body.amount)` converts to a precision-safe
    // `Decimal`. The previous `z.coerce.number()` lost IEEE-754
    // precision before any conversion could rescue it. Reject
    // zero (the schema matches the old `.positive()` semantic —
    // `^0+(\.0+)?$` covers `0`, `00`, `0.0`, `0.00`, etc.).
    amount: z
      .string()
      .regex(
        /^\d{1,15}(\.\d{1,2})?$/,
        "amount must be a positive decimal string with at most 2 fractional digits",
      )
      .refine((s) => !/^0+(\.0+)?$/.test(s), "amount must be greater than 0"),
    currencyCode: z.string().regex(/^[A-Z]{3}$/, "ISO 4217 alphabetic code"),
    kind: z.enum(["income", "expense"]),
    categoryId: z.string().cuid(),
    notes: z
      .string()
      .max(500)
      // Reject ASCII control chars (Cc) — defensive against log
      // injection, CSV export rendering, and terminal escape
      // sequences. Letters / emoji / diacritics (L, M, N) preserved.
      .regex(/^[\P{Cc}]+$/u, "no control characters")
      .optional(),
    occurredAt: z.coerce.date(),
  })
  // Reject unknown keys with a 400 instead of silently stripping
  // them (4R review-risk W2 defense-in-depth: future callers adding
  // privilege-bearing fields like `isAdmin: true` must NOT silently
  // pass through the boundary).
  .strict();

export type CreateTransactionInput = z.infer<typeof createSchema>;
