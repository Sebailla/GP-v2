import { Module } from '@nestjs/common';

import {
  REPORTS_REPOSITORY_TOKEN,
  InMemoryReportsRepository,
} from '@features/reports/server';

import { TransactionsModule } from '../transactions/transactions.module.js';
import { ReportsController } from './reports.controller.js';

/**
 * ReportsModule — NestJS DI wiring for the Reports & Analytics slice.
 *
 * Registers:
 * - `ReportsController` for the 4 GET endpoints under /api/reports/*.
 * - The `REPORTS_REPOSITORY_TOKEN` bound to `InMemoryReportsRepository`.
 *   A follow-up slice swaps this for `PrismaReportsRepository` once
 *   the workspace pnpm + Prisma client generation step is run from
 *   the same branch (the strict workspace resolution in this branch
 *   does not generate the client, so the Prisma adapter is not viable
 *   from here yet).
 *
 * Imports `TransactionsModule` so the FxRateProvider token is in the
 * DI container — `ReportsController` injects `FxRateProvider` directly.
 *
 * Cross-user isolation invariant: the controller uses
 * `@UseGuards(JwtAuthGuard)` to extract `userId` from the JWT, and
 * every service method propagates that userId to the repo. The
 * adapter enforces `where: { createdBy: userId }` at the query level.
 */
@Module({
  imports: [TransactionsModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: REPORTS_REPOSITORY_TOKEN,
      useClass: InMemoryReportsRepository,
    },
  ],
  exports: [REPORTS_REPOSITORY_TOKEN],
})
export class ReportsModule {}
