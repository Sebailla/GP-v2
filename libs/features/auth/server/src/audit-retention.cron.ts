/**
 * Audit-retention handler (M4 module-4-privacy — task 2.10 GREEN).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §2 D2 + §3.3 +
 * `openspec/specs/audit-log-ui/spec.md` "Audit Retention Environment
 * Variable", the cron:
 *
 *   - Fires daily at 03:00 UTC (`@Cron('0 3 * * *')`). 03:00 UTC
 *     keeps retention ops out of operator shift windows (per design
 *     D2 rationale).
 *   - Reads `env.AUDIT_RETENTION_DAYS` (default 90) +
 *     `env.AUDIT_RETENTION_ENABLED` (default false).
 *   - When `AUDIT_RETENTION_ENABLED=false` (dev/test default): no-op,
 *     does NOT call `auditService.purgeOlderThan`.
 *   - When `AUDIT_RETENTION_ENABLED=true`: calls
 *     `auditService.purgeOlderThan(env.AUDIT_RETENTION_DAYS)`.
 *
 * The cron is OPT-IN (`AUDIT_RETENTION_ENABLED=false` in dev/test).
 *
 * Kill-switch matrix (F2 fix — 4R-driven correction):
 *   - `AUDIT_RETENTION_ENABLED=false` → no-op (existing path).
 *   - `AUDIT_RETENTION_DAYS <= 0` → no-op (NEW kill-switch). The
 *     prior behavior forwarded `days=0` verbatim to the service,
 *     which would translate to `now - 0 = now()` and DELETE EVERY
 *     ROW in the audit table. The same hazard exists for any
 *     negative `days` value (the resulting cutoff is pre-1970).
 *     The defensive guard coerces any non-positive value to a
 *     no-op so a misconfigured env var cannot silently wipe the
 *     audit trail.
 *
 * Operator who wants "no automatic retention" can therefore choose:
 *   (a) set `AUDIT_RETENTION_ENABLED=false` (the existing flag), OR
 *   (b) set `AUDIT_RETENTION_DAYS=0` (new no-op kill-switch).
 *
 * Logging contract mirrors `AuthCronService.purgeExpiredResetTokens`:
 * only log when `purged > 0` to avoid a flood of empty-purge log
 * lines in dev/test.
 *
 * ## Why the decorator lives in `apps/api`
 *
 * The `@Cron` decorator from `@nestjs/schedule` requires
 * `experimentalDecorators: true` in the tsconfig that Vite SSR
 * uses for the test transformer. The apps/api tsconfig has it
 * (line 11); the `libs/features/auth/server/tsconfig.json` does
 * NOT. The decorator-bearing class therefore lives in
 * `apps/api/src/modules/auth/` (where the rest of the API's
 * `@Cron`-using service — `AuthCronService` — lives), and this
 * file exports the BUSINESS LOGIC (no decorators, plain method)
 * so the auth slice can unit-test the handler without the Vite
 * SSR transform crash.
 *
 * The schedule registration lives in `apps/api/src/modules/auth/
 * audit-retention.schedule.ts` (the `@Cron` decorator is here).
 * The schedule handler delegates to `purgeExpiredAuditEvents`
 * below — the handler body is shared between the cron tick and
 * any test that calls the method directly.
 */

import { env } from "@core/config";

import type { AuditService } from "./audit.service.js";

/**
 * The plain (decorator-free) handler. The cron schedule delegates
 * to this method; tests call it directly to skip the schedule.
 */
export async function purgeExpiredAuditEvents(
  auditService: AuditService,
  logger: { log: (message: string) => void },
): Promise<void> {
  if (env.AUDIT_RETENTION_ENABLED === false) {
    // Dev/test default + operator kill-switch. No-op.
    return;
  }
  const days = env.AUDIT_RETENTION_DAYS;
  // F2 fix (4R-driven correction): defend against the
  // `AUDIT_RETENTION_DAYS=0` and any negative-value configuration.
  // Forwarding 0 to purgeOlderThan translates to "now - 0 = now()"
  // which matches every row in the audit table — i.e., a full wipe.
  // A negative value translates to a pre-1970 cutoff with the same
  // outcome. Coerce any non-positive value to a no-op so a
  // misconfigured env var cannot silently destroy the audit trail.
  if (days <= 0) {
    logger.log(
      "AUDIT_RETENTION_DAYS<=0: skipping purge (use AUDIT_RETENTION_ENABLED=false to disable retention)",
    );
    return;
  }
  const purged = await auditService.purgeOlderThan(days);
  if (purged > 0) {
    logger.log(`purged ${purged} audit event(s) older than ${days} day(s)`);
  }
}