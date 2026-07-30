import { z } from 'zod';
import { reportSummarySchema } from './report-summary.schema.js';

const decimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/);

/**
 * Single bucket in a series — represents one week or one month of transactions.
 *
 * `label` is the bucket identifier (e.g., `'2026-07'` for month, `'2026-W27'` for ISO week).
 */
export const bucketSeriesPointSchema = z
  .object({
    label: z.string().min(1).max(20),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    income: decimalStringSchema,
    expense: decimalStringSchema,
    net: decimalStringSchema,
  })
  .strict();

export type BucketSeriesPoint = z.infer<typeof bucketSeriesPointSchema>;

/**
 * Series of buckets with summary totals — represents the user's activity over a time window.
 */
export const periodSeriesSchema = z
  .object({
    totals: reportSummarySchema,
    buckets: z.array(bucketSeriesPointSchema),
  })
  .strict();

export type PeriodSeries = z.infer<typeof periodSeriesSchema>;

/**
 * Delta between current and previous series.
 *
 * `netPercent` is `number` (possibly negative) or `null` (serialization of `Infinity`/`NaN`).
 * The ratio can exceed 1.0 (e.g., 200% increase = 2.0).
 */
export const periodDeltaSchema = z
  .object({
    income: decimalStringSchema,
    expense: decimalStringSchema,
    net: decimalStringSchema,
    netPercent: z.number().nullable(),
  })
  .strict();

export type PeriodDelta = z.infer<typeof periodDeltaSchema>;

/**
 * Period comparison — `GET /api/reports/by-period` response shape.
 *
 * `current` is the user's selected range; `previous` is the same-duration window
 * immediately preceding it (NOT calendar-month, to avoid DST drift).
 */
export const reportByPeriodSchema = z
  .object({
    current: periodSeriesSchema,
    previous: periodSeriesSchema,
    delta: periodDeltaSchema,
  })
  .strict();

export type PeriodComparisonReport = z.infer<typeof reportByPeriodSchema>;

/**
 * Re-export the bucket enum for downstream consumers.
 */
export type Bucket = 'week' | 'month';
