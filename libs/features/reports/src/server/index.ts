/**
 * @features/reports/server — barrel.
 *
 * The server-side surface is composed of:
 * - domain ports (ReportsRepository interface + token + types)
 * - domain services (reportsService, timeBucketService, csvSerializer)
 * - infrastructure adapters (InMemoryReportsRepository)
 *
 * The NestJS controller and module live in apps/api/src/modules/reports/
 * (per the repo's convention — controllers in apps/api, services in libs).
 */
export * from './domain/ports/index.js';
export * from './domain/services/index.js';
export * from './infrastructure/index.js';
