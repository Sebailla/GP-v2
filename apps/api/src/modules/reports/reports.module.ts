import { Module } from '@nestjs/common';

import {
  InMemoryReportsRepository,
  REPORTS_REPOSITORY_TOKEN,
  ReportsService,
} from '@features/reports/server';
import {
  FX_RATE_PROVIDER_TOKEN,
  InMemoryFxRateProvider,
} from '@features/transactions';

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
 * - `ReportsService` (concrete NestJS-injectable wrapper around the
 *   pure `reportsService({...})` factory) wired through a useFactory
 *   that injects the two port tokens: REPORTS_REPOSITORY_TOKEN and
 *   FX_RATE_PROVIDER_TOKEN (the latter is re-exported by
 *   TransactionsModule).
 *
 * Imports `TransactionsModule` so the FX_RATE_PROVIDER_TOKEN is in the
 * DI container — the service factory needs it.
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
    {
      provide: ReportsService,
      useFactory: (
        reportsRepository: InMemoryReportsRepository,
        fxRateProvider: InMemoryFxRateProvider,
      ) => new ReportsService({ reportsRepository, fxRateProvider }),
      inject: [REPORTS_REPOSITORY_TOKEN, FX_RATE_PROVIDER_TOKEN],
    },
  ],
  exports: [REPORTS_REPOSITORY_TOKEN, ReportsService],
})
export class ReportsModule {}