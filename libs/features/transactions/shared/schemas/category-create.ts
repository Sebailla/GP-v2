import { z } from "zod";

/**
 * Canonical Zod schema for `POST /categories` request body.
 *
 * Lives at `libs/features/transactions/shared/schemas/category-create.ts`
 * per design §5.5.
 */
export const categoryCreateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(80)
      // Reject control chars — see create.ts for the rationale.
      .regex(/^[\P{Cc}]+$/u, "no control characters"),
    slug: z
      .string()
      .min(1)
      .max(80)
      // Slug is kebab-case; URL-safe. The character class is
      // intentionally duplicated here — there is no shared source.
      // `@core/config/slug.ts` does not exist (verified by 4R review
      // W-risk/W-resilience). If the kebab-case rule ever needs to
      // tighten, update this regex AND any other slug-regex copy in
      // admin tools or seed scripts. No lint rule flags divergence
      // today; the project's boundary plugin has no such rule.
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(["income", "expense"]),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof categoryCreateSchema>;
