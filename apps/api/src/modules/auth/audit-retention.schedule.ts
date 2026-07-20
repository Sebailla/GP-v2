import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { AuditService, purgeExpiredAuditEvents as handler } from "@features/auth";

/**
 * Audit-retention schedule (M4 module-4-privacy — task 2.10 GREEN).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §2 D2 +
 * `openspec/specs/audit-log-ui/spec.md` "Audit Retention Environment
 * Variable", the cron fires daily at 03:00 UTC and calls
 * `auditService.purgeOlderThan(env.AUDIT_RETENTION_DAYS)` ONLY when
 * `env.AUDIT_RETENTION_ENABLED === true` (the D2 opt-in gate).
 *
 * The class lives in `apps/api/src/modules/auth/` (not in
 * `libs/features/auth/`) because the `@Cron` decorator from
 * `@nestjs/schedule` requires `experimentalDecorators: true` in the
 * tsconfig that Vite SSR uses for the test transformer. The apps/api
 * tsconfig has it (line 11); the libs/features/auth/server tsconfig
 * does NOT. The DECORATOR-FREE handler logic lives in
 * `libs/features/auth/server/src/audit-retention.cron.ts` so the
 * auth slice can unit-test the handler without a Vite SSR crash.
 *
 * Pattern mirrors `AuthCronService` (slice 3 batch 6) — a single
 * NestJS provider, constructor-injected dependency, handler method
 * annotated with `@Cron('0 3 * * *')`.
 */
@Injectable()
export class AuditRetentionSchedule {
  private readonly logger = new Logger(AuditRetentionSchedule.name);

  constructor(private readonly auditService: AuditService) {}

  @Cron("0 3 * * *")
  async purgeExpiredAuditEvents(): Promise<void> {
    await handler(this.auditService, {
      log: (message: string) => this.logger.log(message),
    });
  }
}