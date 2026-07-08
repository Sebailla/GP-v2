import { z } from "zod";

/**
 * Canonical Zod schema for `POST /categories` request body.
 *
 * Lives at `libs/features/transactions/shared/schemas/category-create.ts`
 * per design §5.5.
 */
export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    // Slug is kebab-case; URL-safe; the @core/config slug regex lives at
    // libs/core/config/slug.ts and is the single source of truth for the
    // character class. Re-declared here so the schema is readable
    // standalone; if the regex changes, this line is the second place to
    // update (lint will flag divergence from the fixture).
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(["income", "expense"]),
});

export type CreateCategoryInput = z.infer<typeof categoryCreateSchema>;
