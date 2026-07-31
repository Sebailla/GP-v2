import { Module } from '@nestjs/common';

import {
  PrismaReportsRepository,
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
 * - `REPORTS_REPOSITORY_TOKEN` bound to `PrismaReportsRepository` (the
 *   production binding). The previous `InMemoryReportsRepository` binding
 *   is still available via the module's barrel imports for tests +
 *   BDD to substitute via `Test.createTestingModule({...}).overrideProvider(...)`.
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
      useClass: PrismaReportsRepository,
    },
    {
      provide: ReportsService,
      useFactory: (
        reportsRepository: PrismaReportsRepository,
        fxRateProvider: InMemoryFxRateProvider,
      ) => new ReportsService({ reportsRepository, fxRateProvider }),
      inject: [REPORTS_REPOSITORY_TOKEN, FX_RATE_PROVIDER_TOKEN],
    },
  ],
  exports: [REPORTS_REPOSITORY_TOKEN, ReportsService],
})
export class ReportsModule {}
