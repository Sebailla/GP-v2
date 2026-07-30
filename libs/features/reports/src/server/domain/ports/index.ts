/**
 * @features/reports/server/domain/ports — barrel.
 * Re-exports the ReportsRepository port + types for downstream consumers.
 */
export type {
  ReportsRepository,
  TransactionForReport,
  DateRange,
} from './reports.repository.js';

export type { ReportsRepositoryToken } from './reports.repository.token.js';

export { REPORTS_REPOSITORY_TOKEN } from './reports.repository.token.js';

export type { UserId, CategoryId, CurrencyCode, IsoDate } from './types.js';
