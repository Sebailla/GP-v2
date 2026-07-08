import { z } from "zod";

/**
 * Canonical Zod schema for `PATCH /transactions/:id` request body.
 *
 * Lives at `libs/features/transactions/shared/schemas/update.ts` per
 * design §5.5. Partial of `createSchema` — every field is optional except
 * `id` (path param). Re-declared rather than `.partial()`-extended so the
 * shape is reviewer-friendly and the inferred `UpdateTransactionInput`
 * doesn't accidentally relax the `kind` enum or `amount` granularity.
 */
export const updateSchema = z.object({
  amount: z.coerce.number().positive().multipleOf(0.01).optional(),
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/, "ISO 4217 alphabetic code")
    .optional(),
  kind: z.enum(["income", "expense"]).optional(),
  categoryId: z.string().cuid().optional(),
  notes: z
    .string()
    .max(500)
    .regex(/^[\P{Cc}]+$/u, "no control characters")
    .optional(),
  occurredAt: z.coerce.date().optional(),
}).strict();

export type UpdateTransactionInput = z.infer<typeof updateSchema>;
