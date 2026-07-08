import { z } from "zod";

/**
 * Canonical Zod schema for `PATCH /categories/:id` request body.
 *
 * Lives at `libs/features/transactions/shared/schemas/category-update.ts`
 * per design §5.5. `slug` is intentionally NOT updatable here — slugs
 * are stable identifiers that downstream URLs depend on; renaming a
 * slug is a separate destructive operation that would land in a future
 * slice.
 */
export const categoryUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(["income", "expense"]).optional(),
});

export type UpdateCategoryInput = z.infer<typeof categoryUpdateSchema>;
