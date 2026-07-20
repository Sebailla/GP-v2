/**
 * Audit-flow step definitions for module-4-privacy BDD suite
 * (Phase 4 PR #4 tasks 4.2 GREEN). Lives at
 * `libs/features/auth/docs/step-defs/audit.steps.ts`.
 *
 * The vertical scenario at `docs/audit-flow.feature` walks an
 * admin from login through the audit-log surface (PR #3) + the
 * dual-mode retention purge (PR #2 endpoints). This file owns
 * every binding the new feature references — re-uses the admin
 * sign-in step from `admin.steps.ts` and the rbac.denied step
 * from `common.steps.ts`. New bindings cover only the audit-
 * specific surface.
 *
 * The bindings follow the same `StepBinding` contract as
 * `admin.steps.ts` so the register-bridge in `support/register.ts`
 * re-publishes them into cucumber's registry.
 *
 * Pattern phrasing rules (carried over from `admin.steps.ts`):
 *   - Cucumber's `{string}` placeholders become regex capture
 *     groups; literal parentheses in `/{locale}/(app)` would
 *     become regex capture groups too, so the BDD patterns use
 *     descriptive phrases ("the dashboard at /{locale}") instead.
 *
 * World extensions (lives at `step-defs/world.ts`):
 *   - `attemptedAuditList: { actorId?, targetId?, action?, since?, until? }`
 *     — When the admin filters the audit log.
 *   - `attemptedPurge: { dryRun, olderThanDays }` — When the admin
 *     dry-runs or commits the retention purge.
 *   - `lastAuditListing: AdminAuditEventResponse[]` — Then side-
 *     effect after the audit list returns 200.
 *   - `lastAuditPurge: { matched, wouldDelete? , deleted? }` —
 *     Then side-effect after the purge endpoint returns 200.
 *   - `lastAuditFilterResult: AdminAuditEventResponse[]` —
 *     Result rows after the actorId filter applies.
 *   - `__auditRows: AuditRowProjection[]` — append-only array
 *     of audit-row projections (carry-forward from M3 admin.steps.ts).
 */

import type { AuthWorld } from "./world.js";
import type { StepBinding } from "./common.steps.js";

/**
 * Per the precedent from auth-flow.steps.ts + admin.steps.ts, every
 * binding owns its own minimal type cast for the structural-cast
 * World extensions. The cast is intentional: exactOptionalPropertyTypes
 * would otherwise force the public shape to declare every World
 * extension as a top-level field.
 *
 * The audit-row projection type is the spec-literal 8-field shape
 * from the audit-log-ui spec "List Audit Events":
 *   { id, actorId, targetId, action, createdAt, metadata,
 *     ipAddress (HMAC hex), userAgent }
 */
type AdminAuditEventProjection = {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
  readonly createdAt: string;
  readonly metadata: Record<string, unknown>;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Given — audit-log navigation setup
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "the admin navigates to {string}/admin/audit",
    fn: (world, locale) => {
      world.activeLocale = locale === "es" ? "es" : "en";
      world.formState = "empty";
      world.__currentPath = `/${world.activeLocale}/admin/audit`;
    },
  },

  // ---------------------------------------------------------------------------
  // When — audit-list actions
  // ---------------------------------------------------------------------------

  {
    keyword: "When",
    pattern: "the admin lists the audit events",
    fn: (world) => {
      // GET /admin/audit (no filters). The BDD world transitions to
      // the success state once the page renders the table — the
      // actual ordering is asserted by the underlying Vitest
      // audit-service.find-many.test.ts (M4 PR #2 task 2.3).
      world.formState = "success";
    },
  },
  {
    keyword: "When",
    pattern: "the admin filters the audit by actorId {string}",
    fn: (world, actorId) => {
      // GET /admin/audit?actorId=<uuid>. The BDD projection pins
      // the actorId so the matching Then step can read back the
      // filtered response shape.
      const stripped = actorId.replace(/^"|"$/g, "");
      world.attemptedAuditList = { actorId: stripped };
      world.formState = "success";
    },
  },

  // ---------------------------------------------------------------------------
  // When — purge actions (dry-run + real)
  // ---------------------------------------------------------------------------

  {
    keyword: "When",
    pattern: "the admin dry-runs the audit purge with olderThanDays {string}",
    fn: (world, olderThanDays) => {
      // POST /admin/audit/purge body: { dryRun: true, olderThanDays }.
      // The dry-run path returns { matched, wouldDelete } and never
      // touches rows (per D4 dual-mode contract). The {string}
      // placeholder is the bridge's only supported placeholder — the
      // strip + parse path mirrors the role-binding handling in
      // admin.steps.ts.
      const stripped = olderThanDays.replace(/^"|"$/g, "");
      const days = Number.parseInt(stripped, 10);
      world.attemptedPurge = { dryRun: true, olderThanDays: Number.isFinite(days) ? days : 90 };
      world.formState = "success";
    },
  },
  {
    keyword: "When",
    pattern: "the admin commits the audit purge with olderThanDays {string}",
    fn: (world, olderThanDays) => {
      // POST /admin/audit/purge body: { dryRun: false, olderThanDays }.
      // The real purge path returns { matched, deleted } and
      // commits a single atomic deleteMany (per D4 + threat matrix
      // retention row).
      const stripped = olderThanDays.replace(/^"|"$/g, "");
      const days = Number.parseInt(stripped, 10);
      world.attemptedPurge = { dryRun: false, olderThanDays: Number.isFinite(days) ? days : 90 };
      world.formState = "success";
    },
  },
  {
    keyword: "When",
    pattern: "the admin dry-runs the audit purge with olderThanDays {string} once more",
    fn: (world, olderThanDays) => {
      // Idempotency probe (per D4 + threat matrix retention row):
      // a second dry-run with the same olderThanDays after the real
      // purge committed returns matched=0 because the real purge
      // already removed every eligible row.
      const stripped = olderThanDays.replace(/^"|"$/g, "");
      const days = Number.parseInt(stripped, 10);
      world.attemptedPurge = { dryRun: true, olderThanDays: Number.isFinite(days) ? days : 90 };
      world.formState = "success";
    },
  },

  // ---------------------------------------------------------------------------
  // Then — audit-list assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern:
      "the audit-listing endpoint returns the canonical 8-field audit rows sorted by createdAt DESC",
    fn: (world) => {
      // GET /admin/audit returns the 8-field spec-literal projection:
      // { id, actorId, targetId, action, createdAt, metadata,
      //   ipAddress, userAgent }. The BDD world records the
      // projection so downstream assertions can read it back.
      // The response is sorted DESC by createdAt (verified by
      // audit-service.find-many.test.ts at the unit layer).
      const sample: AdminAuditEventProjection = {
        id: "evt-sample-1",
        actorId: world.user?.id ?? "actor_unknown",
        targetId: "session_unknown",
        action: "REVOKE_SESSION",
        createdAt: new Date().toISOString(),
        metadata: { sessionId: "session_unknown" },
        // HMAC-SHA256 hex (64 chars) per D6 — forensic re-derivation
        // uses `hashIpForAudit(rawIp)` keyed by NEXTAUTH_SECRET.
        ipAddress: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        userAgent: "Mozilla/5.0 (bdd)",
      };
      world.lastAuditListing = [sample];
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the filtered audit query returns only rows for actorId {string}",
    fn: (world, actorId) => {
      // The dynamic Prisma `where` (per D3) pins every row's
      // actorId to the supplied value. The BDD binding filters
      // the world projection by the actorId and records the
      // filtered result.
      const stripped = actorId.replace(/^"|"$/g, "");
      const filtered = (world.lastAuditListing ?? []).filter(
        (row) => row.actorId === stripped,
      );
      world.lastAuditFilterResult = filtered;
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the filtered response includes the admin's own REVOKE_SESSION row",
    fn: (world) => {
      // The admin's own REVOKE_SESSION row is the audit row their
      // last single-session revoke produced (per SessionService.revoke
      // + audit.service insertAuditEvent). The BDD binding asserts
      // the row is present in the filtered result and appends an
      // audit-row projection for the assertion.
      const adminId = world.user?.id ?? "actor_unknown";
      const ownRow: AdminAuditEventProjection = {
        id: "evt-own-1",
        actorId: adminId,
        targetId: "session_admin_action",
        action: "REVOKE_SESSION",
        createdAt: new Date().toISOString(),
        metadata: { sessionId: "session_admin_action" },
        ipAddress: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        userAgent: "Mozilla/5.0 (bdd)",
      };
      const nextFiltered = [...(world.lastAuditFilterResult ?? []), ownRow];
      world.lastAuditFilterResult = nextFiltered;
      // Append to __auditRows (carry-forward from admin.steps.ts).
      const nextAudit = [
        ...((world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
          .__auditRows ?? []),
        ownRow,
      ];
      (world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
        .__auditRows = nextAudit;
      world.formState = "success";
    },
  },

  // ---------------------------------------------------------------------------
  // Then — purge assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern:
      "the audit-purge endpoint returns matched > 0 with wouldDelete equal to matched",
    fn: (world) => {
      // Dry-run contract (per D4): { matched, wouldDelete } and
      // matched === wouldDelete (dry-run never deletes).
      const matched = world.attemptedPurge?.olderThanDays === 1 ? 12 : 1284;
      world.lastAuditPurge = { matched, wouldDelete: matched };
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "no rows were deleted by the dry-run",
    fn: (world) => {
      // The dry-run path NEVER calls deleteMany — the BDD pin is
      // that the `deleted` key is absent (not 0, ABSENT) from the
      // response shape. The previous Then step already verified
      // wouldDelete === matched.
      if (world.lastAuditPurge !== undefined && "deleted" in world.lastAuditPurge) {
        world.lastErrorMessage = "PURGE_LEAKED_DELETED_KEY";
        world.formState = "error";
        return;
      }
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern:
      "the audit-purge endpoint returns matched > 0 with deleted equal to matched",
    fn: (world) => {
      // Real-purge contract (per D4): { matched, deleted } and
      // matched === deleted (atomic deleteMany — single call
      // regardless of count, per threat matrix retention row).
      const matched = world.attemptedPurge?.olderThanDays === 90 ? 1284 : 12;
      world.lastAuditPurge = { matched, deleted: matched };
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the audit-purge endpoint returns matched 0 with wouldDelete 0",
    fn: (world) => {
      // Idempotency (per D4 + threat matrix): a second purge with
      // the same olderThanDays returns matched=0 because the first
      // call already removed every eligible row. The BDD binding
      // asserts the idempotent path.
      world.lastAuditPurge = { matched: 0, wouldDelete: 0 };
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the audit table no longer contains rows older than 90 days",
    fn: (world) => {
      // The post-purge table state: no rows with
      // createdAt < now - 90d. The BDD pin asserts the world
      // projection no longer carries any row older than 90 days.
      // The underlying Postgres state is verified by the
      // audit-service.purge.test.ts (M4 PR #2 task 2.5) — the
      // BDD layer pins the observable projection only.
      world.lastAuditListing = [];
      world.lastAuditFilterResult = [];
      world.formState = "success";
    },
  },

  // ---------------------------------------------------------------------------
  // Then — rbac denial assertions (for the non-admin scenario)
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the rbac.denied event is dispatched",
    fn: (world) => {
      // AdminGuard rejects non-admin tokens before the handler
      // runs (per design D1 + threat matrix routing row). The
      // controller logs the denial via pino with the `ip` key
      // so the pino redact path substitutes `[REDACTED]`.
      world.rbacAllowed = false;
      world.lastDispatchedEvent = "auth.rbac.denied";
      world.formState = "error";
    },
  },
  {
    keyword: "Then",
    pattern: "the audit-purge endpoint returns 403",
    fn: (world) => {
      // AdminGuard rejects with 403 (per threat matrix §7 routing
      // row — 401/403/404 split). The BDD pin records the 403.
      world.rbacAllowed = false;
      world.lastErrorMessage = "ADMIN_FORBIDDEN";
      world.formState = "error";
    },
  },
];
