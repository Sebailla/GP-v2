import { z } from 'zod';

const decimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/);
const cuidSchema = z.string().cuid();

/**
 * Category breakdown — one row per category in the response of
 * `GET /api/reports/by-category`. Ordered by absolute expense DESC.
 */
export const reportByCategorySchema = z
  .object({
    categoryId: cuidSchema,
    categoryName: z.string().min(1).max(120),
    total: decimalStringSchema,
    transactionCount: z.number().int().nonnegative(),
    share: z.number().min(0).max(1),
  })
  .strict();

export type CategoryBreakdownReport = z.infer<typeof reportByCategorySchema>;
