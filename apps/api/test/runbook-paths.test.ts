import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * TDD contract — M5 5.3 RED → 5.4 GREEN.
 *
 * Per `openspec/changes/module-5-production-hardening/tasks.md` task
 * 5.3 RED + design §4 (M5 D5-D6 closure):
 *
 *   - The runbook (`docs/operations/audit-retention-runbook.md`)
 *     MUST reference the actual cron file paths the codebase ships.
 *     The M4 runbook was authored when the cron lived at
 *     `audit-retention.handler.ts` + `audit-retention.cron.ts`;
 *     M4 refactored the decorator-free handler into
 *     `audit-retention.cron.ts` + the schedule into
 *     `audit-retention.schedule.ts`. The runbook references must
 *     match the current file names so an operator following the
 *     runbook reaches the actual code, not a dead path.
 *   - The verification grep pattern MUST match a string the runtime
 *     actually emits. M4 wrote `grep "audit-retention"`; the
 *     current schedule class is `AuditRetentionSchedule` (the class
 *     name appears in the `[audit-retention]` log prefix the
 *     NestJS Logger emits). Pinning the grep to a stable class-name
 *     token (`AuditRetentionSchedule`) ensures a future rename
 *     fails the test loud and clear.
 *
 * What this test verifies (per tasks.md 5.3):
 *   1. The runbook references the actual files:
 *      - `libs/features/auth/server/src/audit-retention.cron.ts`
 *        (the decorator-free handler — was previously
 *        `audit-retention.handler.ts`).
 *      - `apps/api/src/modules/auth/audit-retention.schedule.ts`
 *        (the schedule — was previously `audit-retention.cron.ts`).
 *   2. The grep pattern in the runbook matches the class name the
 *      NestJS Logger emits:
 *      - `AuditRetentionSchedule` (the class name in
 *        `audit-retention.schedule.ts`).
 *
 * Both the English runbook AND the Spanish mirror
 * (`Documents-es/docs/operations/audit-retention-runbook.md`) MUST
 * pass the contract.
 */

// apps/api uses CommonJS (`module: commonjs` in tsconfig), so
// `__dirname` is provided at runtime by the test harness. We avoid
// `import.meta.url` because the typecheck rejects the meta-property
// under CommonJS (TS1343).
//   apps/api/test/runbook-paths.test.ts → ../../../ = REPO_ROOT
const REPO_ROOT = path.resolve(__dirname, "../../..");

const RUNBOOK_PATHS = [
  path.join(REPO_ROOT, "docs/operations/audit-retention-runbook.md"),
  path.join(REPO_ROOT, "Documents-es/docs/operations/audit-retention-runbook.md"),
] as const;

describe("runbook path/grep accuracy (M5 5.3 RED)", () => {
  it.each(RUNBOOK_PATHS)("runbook references the actual cron file paths: %s", (runbookPath) => {
    const body = readFileSync(runbookPath, "utf8");
    // M4 refactor: the decorator-free handler is at
    // `libs/features/auth/server/src/audit-retention.cron.ts` (NOT
    // `audit-retention.handler.ts`). The schedule shell is at
    // `apps/api/src/modules/auth/audit-retention.schedule.ts` (NOT
    // `audit-retention.cron.ts`). An operator following the runbook
    // MUST reach the actual code, so the runbook must use the live
    // paths.
    expect(body).toContain("libs/features/auth/server/src/audit-retention.cron.ts");
    expect(body).toContain("apps/api/src/modules/auth/audit-retention.schedule.ts");
    // Stale path references (the M4-era names) MUST NOT appear —
    // every operator-facing reference must match the live codebase.
    expect(body).not.toContain("audit-retention.handler.ts");
    expect(body).not.toMatch(/apps\/api\/src\/modules\/auth\/audit-retention\.cron\.ts/);
  });

  it.each(RUNBOOK_PATHS)("runbook grep pattern matches the schedule class name: %s", (runbookPath) => {
    const body = readFileSync(runbookPath, "utf8");
    // M4 refactor: the grep must reference the class name
    // (`AuditRetentionSchedule`) so a future rename trips the test
    // and the runbook follows. The M4-era pattern
    // `grep "audit-retention"` is too narrow — it matches the log
    // prefix but won't catch a class rename.
    expect(body).toContain("AuditRetentionSchedule");
  });
});
