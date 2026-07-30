/**
 * @features/reports/shared/schemas — barrel re-export for Zod schemas.
 *
 * The boundary ESLint plugin's `no-schemas-outside-shared` rule
 * whitelists this directory; new schemas MUST be added here so the
 * single-source-of-truth invariant holds for both the web client
 * and the NestJS server.
 */
export {
  reportQuerySchema,
  reportByPeriodQuerySchema,
  reportExportQuerySchema,
  type ReportQuery,
  type ReportByPeriodQuery,
  type ReportExportQuery,
} from './report-query.schema.js';

export {
  reportSummarySchema,
  type ReportsSummary,
} from './report-summary.schema.js';

export {
  reportByCategorySchema,
  type CategoryBreakdownReport,
} from './report-by-category.schema.js';

export {
  reportByPeriodSchema,
  periodSeriesSchema,
  periodDeltaSchema,
  bucketSeriesPointSchema,
  type PeriodComparisonReport,
  type PeriodSeries,
  type PeriodDelta,
  type BucketSeriesPoint,
  type Bucket,
} from './report-by-period.schema.js';
