import { z } from 'zod';

/**
 * ISO-8601 date string (`YYYY-MM-DD`).
 * Mirrors the canonical `list` schema at @features/transactions/shared/schemas/list.ts.
 */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO-8601 date (YYYY-MM-DD)');

/**
 * ISO-4217 currency code (3 uppercase letters).
 */
const iso4217Schema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Expected ISO-4217 currency code (3 uppercase letters)');

/**
 * Canonical report query — `fromDate`, `toDate`, optional `currencyCode`.
 *
 * - Range cap: `toDate - fromDate ≤ 365 days`. Beyond that, the server returns 400.
 * - Inverted ranges are accepted (zero-result probe by design).
 * - `strict()` rejects unknown keys (mirror of canonical `list` schema).
 */
export const reportQuerySchema = z
  .object({
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    currencyCode: iso4217Schema.optional(),
  })
  .strict()
  .refine(
    (q) => {
      const from = Date.parse(q.fromDate);
      const to = Date.parse(q.toDate);
      const days = Math.abs((to - from) / (1000 * 60 * 60 * 24));
      return days <= 365;
    },
    { message: 'Range > 365 days', path: ['toDate'] },
  );

export type ReportQuery = z.infer<typeof reportQuerySchema>;

/**
 * Period-comparison query — extends `reportQuerySchema` with a required `bucket`.
 */
export const reportByPeriodQuerySchema = reportQuerySchema.extend({
  bucket: z.enum(['week', 'month']),
});

export type ReportByPeriodQuery = z.infer<typeof reportByPeriodQuerySchema>;

/**
 * Export query — extends `reportQuerySchema` with an optional `detail` (defaults to `'summary'`).
 */
export const reportExportQuerySchema = reportQuerySchema.extend({
  detail: z.enum(['summary', 'transactions']).default('summary'),
});

export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
