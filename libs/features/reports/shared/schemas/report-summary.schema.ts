import { z } from 'zod';
import { reportQuerySchema } from './report-query.schema.js';

/**
 * Decimal as a string (preserves precision across the JSON seam).
 * Mirrors the canonical `list` schema's Decimal serialization.
 */
const decimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/);

/**
 * Reports summary — `GET /api/reports/summary` response shape.
 *
 * - `income` / `expense` / `net` are Decimal strings (preserve wire precision).
 * - `expense` is sign-aware: negative for outflow.
 * - `fxFreshness` indicates whether any FX rate used was older than 24h.
 */
export const reportSummarySchema = reportQuerySchema.extend({
  income: decimalStringSchema,
  expense: decimalStringSchema,
  net: decimalStringSchema,
  transactionCount: z.number().int().nonnegative(),
  fxFreshness: z.enum(['fresh', 'stale']),
});

export type ReportsSummary = z.infer<typeof reportSummarySchema>;
