/**
 * @features/reports/server/domain/services — barrel.
 * Re-exports the pure-domain services and the service-only types.
 *
 * TypeScript shapes that mirror Zod schemas live in
 * `@features/reports/shared/schemas` and are re-exported via the
 * shared barrel — we don't duplicate them here to avoid TS2308
 * "already exported" ambiguity errors.
 */
export {
  reportsService,
  ReportsService,
  type FxRateProvider,
  type ReportsServiceApi,
  type ReportsServiceDeps,
  type CsvExportResult,
} from './reports.service.js';

export { timeBucketService } from './time-bucket.service.js';
export { csvSerializer } from './csv-serializer.js';
