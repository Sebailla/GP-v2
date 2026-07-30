import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MailModule } from "./mail/mail.module.js";
import { MetricsModule } from "./modules/metrics/metrics.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { TransactionsModule } from "./modules/transactions/transactions.module.js";

/**
 * Slice 1 ships an empty AppModule. Feature modules (auth in slice 3,
 * transactions in slice 5) are imported here as they land.
 *
 * This module intentionally contains zero business code - it is the
 * NestJS container's composition root. Slice 3 batch 6 (T3.6) wires
 * the AuthModule (thin NestJS wrapper around @features/auth/server).
 * Slice 5 PR #3 (T5.11) wires the TransactionsModule (REST surface
 * for /transactions + /categories; see design §5.3).
 *
 * Module 1 (T1.4) — HealthModule wires /healthz, /readyz, /status
 * (R-PF-4). T1.7 added MetricsModule to expose GET /metrics (R-PF-9).
 * MailModule (T1.12) lands in its own task.
 *
 * JD-1 fix (JD-driven correction round 1): without
 * `ScheduleModule.forRoot()`, the `@Cron('0 3 * * *')` decorator on
 * `AuditRetentionSchedule` is metadata only — the @nestjs/schedule
 * `DiscoveryService` never picks it up and the retention cron never
 * registers in the `SchedulerRegistry`. With
 * `AUDIT_RETENTION_ENABLED=true`, the operator believes retention is
 * active; in production the cron is silently inactive. Activating the
 * schedule module at the composition root activates every `@Cron`
 * decorator in the wired modules.
 */
@Module({
  imports: [
    AuthModule,
    HealthModule,
    MailModule,
    MetricsModule,
    ReportsModule,
    ScheduleModule.forRoot(),
    TransactionsModule,
  ],
})
export class AppModule {}
