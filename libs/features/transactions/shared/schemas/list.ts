import { z } from "zod";

/**
 * Canonical Zod schema for `GET /transactions` query string.
 *
 * Lives at `libs/features/transactions/shared/schemas/list.ts` per
 * design §5.5. Cursor pagination is intentionally URL-only (no offset);
 * the controller pair-slices the cursor from a previous response's
 * `nextCursor` field. pageSize is bounded to 1..100 with a default of 20
 * to keep unbounded lists from sneaking in.
 *
 * Filters mirror the controller surface in design §5.3:
 *  - categoryId: filter transactions by category.
 *  - fromDate / toDate: half-open [fromDate, toDate) range on occurredAt.
 *  - currencyCode: ISO 4217 code, exactly 3 chars.
 */
export const listSchema = z.object({
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().cuid().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  currencyCode: z.string().length(3).optional(),
});

export type ListTransactionsQuery = z.infer<typeof listSchema>;
