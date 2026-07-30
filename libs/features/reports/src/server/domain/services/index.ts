/**
 * @features/reports/server/domain/services — barrel.
 * Re-exports the pure-domain services.
 */
export {
  reportsService,
  type FxRateProvider,
  type ReportQuery,
  type ReportsSummary,
  type CategoryBreakdownReport,
  type PeriodComparisonReport,
  type PeriodSeries,
  type PeriodBucket,
  type PeriodDelta,
  type Bucket,
  type CsvExportResult,
  type ReportsServiceDeps,
  type ReportsService,
} from './reports.service.js';

export { timeBucketService, type Bucket as BucketType, type BucketSeriesPoint } from './time-bucket.service.js';
export { csvSerializer } from './csv-serializer.js';
