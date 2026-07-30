/**
 * @features/reports/server/infrastructure/adapters — barrel.
 *
 * Concrete implementations of the ReportsRepository port. The slice
 * currently ships the in-memory adapter (used by tests + BDD); the
 * Prisma adapter is a follow-up slice (the workspace pnpm + Prisma
 * generation step is a separate work unit).
 */
export { InMemoryReportsRepository } from './in-memory-reports.repository.js';
