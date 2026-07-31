/**
 * @features/reports/server/infrastructure/adapters — barrel.
 *
 * Concrete implementations of the ReportsRepository port.
 *
 * Two adapters ship:
 * - `InMemoryReportsRepository` — the test + BDD binding. State lives
 *   in a process-local Map keyed by userId. Seeded via `seedTransactions`.
 * - `PrismaReportsRepository` — the production binding. Reads from
 *   Postgres via the shared `@core/database` PrismaClient. The module
 *   bindings in `apps/api/src/modules/reports/reports.module.ts` select
 *   which one is active for each environment.
 *
 * Cross-user isolation invariant: both adapters filter every read by
 * `userId`. The Prisma adapter also filters `deletedAt: null` (D-TX-5).
 * A foreign-owned row is indistinguishable from a missing row — no
 * information leak on "exists vs. mine" (D-TX-7).
 */
export { InMemoryReportsRepository } from './in-memory-reports.repository.js';
export { PrismaReportsRepository } from './prisma-reports.repository.js';
