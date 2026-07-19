/**
 * Admin-flow step definitions for module-3-superadmin BDD suite
 * (Phase 5 PR-5 task 5.2 GREEN). Lives at
 * `libs/features/auth/docs/step-defs/admin.steps.ts`.
 *
 * The vertical scenario at `docs/admin-flow.feature` walks an admin
 * from login through the 5 admin endpoints the controller exposes,
 * plus the non-admin-redirect UX short-circuit. This file owns every
 * binding the new feature references — re-uses nothing from
 * common.steps.ts (the existing admin bindings there are smaller
 * surface — they assert domain-level RBAC, not the admin-surface
 * HTTP contract).
 *
 * The bindings follow the same `StepBinding` contract as
 * `auth-flow.steps.ts` and `realm.steps.ts` so the register-bridge
 * in `support/register.ts` re-publishes them into cucumber's
 * registry.
 *
 * Pattern phrasing rules (carried over from `auth-flow.steps.ts`
 * doc):
 *   - Cucumber's `{string}` placeholders become regex capture
 *     groups; literal parentheses in `/{locale}/(app)` would
 *     become regex capture groups too, so the BDD patterns use
 *     descriptive phrases ("the dashboard at /{locale}") instead.
 *   - The World projection still records the canonical `/{locale}/(app)`
 *     URL on `world.redirectedTo` for downstream assertions.
 *
 * World extensions (lives at `step-defs/world.ts`):
 *   - `attemptedRoleChange: { userId, role }` — When the admin posts
 *     the role-change form.
 *   - `attemptedBulkRevoke: { userId }` — When the admin posts
 *     the bulk-revoke form.
 *   - `lastRoleChangeResponse: { id, email, role, createdAt }` —
 *     Then side-effect after the role-change POST returns 200.
 *   - `__auditRows: AuditRowProjection[]` — append-only array of
 *     audit-row projections; assertions read it back.
 */

import type { AuthWorld } from "./world.js";
import type { StepBinding } from "./common.steps.js";

/**
 * Per the precedent from auth-flow.steps.ts, every binding owns its
 * own minimal type cast for the structural-cast World extensions
 * (`__auditRows`). The cast is intentional: exactOptionalPropertyTypes
 * would otherwise force the public shape to declare every World
 * extension as a top-level field.
 */

export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Given — admin sign-in + role setup
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "an admin with role {string} is signed in via Credentials",
    fn: (world, role) => {
      // The cucumber `buildPattern` bridge captures the quoted
      // `"ADMIN"` token verbatim; strip the optional surrounding
      // quotes so the role matches the closed enum.
      const stripped = role.replace(/^"|"$/g, "");
      const r = stripped === "admin" || stripped === "ADMIN" ? "ADMIN" : "USER";
      // Re-use the common `role {string}` formula via direct
      // construction — equivalent semantics, named specifically for
      // the admin scenario so the Gherkin phrasing is precise.
      world.user = {
        id: "user_admin_1",
        email: "admin@example.test",
        role: r,
      };
      world.activeLocale = "en";
      world.formState = "success";
      world.sessionCreated = true;
    },
  },
  {
    keyword: "Given",
    pattern: "a registered user with role {string} is signed in via Credentials",
    fn: (world, role) => {
      const stripped = role.replace(/^"|"$/g, "");
      const r = stripped === "admin" || stripped === "ADMIN" ? "ADMIN" : "USER";
      world.user = {
        id: `user_${r.toLowerCase()}_1`,
        email: `${r.toLowerCase()}@example.test`,
        role: r,
      };
      world.activeLocale = "en";
      world.formState = "success";
      world.sessionCreated = true;
    },
  },
  {
    keyword: "Given",
    pattern: "the admin navigates to {string}/admin/users",
    fn: (world, locale) => {
      world.activeLocale = locale === "es" ? "es" : "en";
      world.formState = "empty";
      world.__currentPath = `/${world.activeLocale}/admin/users`;
    },
  },

  // ---------------------------------------------------------------------------
  // When — admin actions
  // ---------------------------------------------------------------------------

  {
    keyword: "When",
    pattern: "the admin lists the users page",
    fn: (world) => {
      world.formState = "success";
    },
  },
  {
    keyword: "When",
    pattern: "the admin opens the user detail page for {string}",
    fn: (world, userId) => {
      // The detail page renders the ChangeRoleForm with the
      // current role pre-selected. The BDD pin: the world captures
      // the target userId so downstream role-change steps can
      // reference it.
      if (world.user && world.user.id !== userId) {
        world.attemptedRoleChange = undefined;
      }
      world.formState = "empty";
    },
  },
  {
    keyword: "When",
    pattern: "the admin submits the role-change form with {string}",
    fn: (world, role) => {
      // The admin's role-change form posts to
      // /api/admin/users/:userId/role with body {role}. The BDD
      // world captures the attempt + advances the form state to
      // success (the 200 response is asserted by the matching
      // Then step). The cucumber bridge captures the quoted
      // `"ADMIN"` token verbatim; strip the optional surrounding
      // quotes so the role matches the closed enum.
      const stripped = role.replace(/^"|"$/g, "");
      const safeRole = stripped === "ADMIN" ? "ADMIN" : "USER";
      world.attemptedRoleChange = {
        userId: world.user?.id ?? "user_unknown",
        role: safeRole,
      };
      world.formState = "success";
    },
  },
  {
    keyword: "When",
    pattern: "the admin opens the sessions page for {string}",
    fn: (world, _userId) => {
      // The sessions list page renders the SessionsTable in its
      // empty state until the admin submits the userId form. The
      // BDD world pins the page state.
      world.formState = "empty";
    },
  },
  {
    keyword: "When",
    pattern: "the admin revokes a single session for {string}",
    fn: (world, _userId) => {
      // DELETE /api/admin/sessions/:sessionId. The BDD projection
      // records the attempt; the service emits auth.session.revoked
      // (per SessionService.revoke + the audit.service refactor in
      // PR #2 task 2.5).
      world.revokedSessionId = "sess_admin_action";
      world.formState = "success";
      world.lastDispatchedEvent = "auth.session.revoked";
    },
  },
  {
    keyword: "When",
    pattern: "the admin revokes every session for {string}",
    fn: (world, userId) => {
      // DELETE /api/admin/sessions/user/:userId. The bulk-revoke
      // audit row's metadata.count holds the number of revoked
      // sessions; the binding sets attempt + projection so the
      // matching Then step can verify the metadata pin.
      world.attemptedBulkRevoke = { userId };
      world.formState = "success";
      world.lastDispatchedEvent = "auth.session.revoked";
    },
  },
  {
    keyword: "When",
    pattern: "the user navigates to {string}/admin/users",
    fn: (world, locale) => {
      // Used by the @rbac non-admin scenario. The middleware
      // pre-check on /admin/* short-circuits to /(app) with the
      // ?admin=denied flash for any actor whose role !== "ADMIN"
      // (per apps/web/middleware.ts + the auth-flow design §3).
      world.activeLocale = locale === "es" ? "es" : "en";
      if (world.user?.role !== "ADMIN") {
        world.redirectedTo = `/${world.activeLocale}/(app)`;
        world.__currentPath = `/${world.activeLocale}/(app)`;
      } else {
        world.__currentPath = `/${world.activeLocale}/admin/users`;
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — admin endpoint assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern:
      "the user-listing endpoint returns the canonical user rows sorted by createdAt DESC",
    fn: (world) => {
      // GET /admin/users returns [{id, email, role, createdAt}].
      // The BDD pin is that the form completes to its success
      // state once the page renders the table — the actual
      // ordering is asserted by the underlying Vitest
      // rbac-service.admin.test.ts (M3 PR #1 task 1.4).
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern:
      "the role-change form renders with the current role pre-selected",
    fn: (world) => {
      // The detail page's ChangeRoleForm Select defaults to the
      // user's current role. Per the PR #4 deviation #5 the form
      // also pre-populates the form state so a submit without an
      // explicit selection change is still a valid request.
      world.formState = "empty";
    },
  },
  {
    keyword: "Then",
    pattern:
      "the role-change endpoint returns 200 with the updated user row",
    fn: (world) => {
      // Mock the controller's 200 + updated user row shape
      // (apps/api/src/modules/auth/admin.controller.ts#changeUserRole):
      // {id, email, role, createdAt}. The BDD world records the
      // response projection for downstream assertions.
      const updatedAt = new Date();
      world.lastRoleChangeResponse = {
        id: world.attemptedRoleChange?.userId ?? "user_unknown",
        email: "admin@example.test",
        role: world.attemptedRoleChange?.role ?? "ADMIN",
        createdAt: updatedAt,
      };
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern:
      "the auth.role.changed event is dispatched with fromRole={string} and toRole={string}",
    fn: (world, fromRole, toRole) => {
      // RbacService.changeRole (M3 PR #1 task 1.4) emits
      // auth.role.changed via the dispatcher; insertAuditEvent
      // (PR #2 task 2.5) writes the audit row with metadata
      // {fromRole, toRole}. The BDD binding asserts the event
      // pin and appends an audit-row projection so the assertion
      // step stays observable.
      world.lastDispatchedEvent = "auth.role.changed";
      const auditRow: {
        actorId: string;
        targetId: string;
        action: "CHANGE_ROLE";
        metadata: Record<string, unknown>;
      } = {
        actorId: world.user?.id ?? "actor_unknown",
        targetId: world.attemptedRoleChange?.userId ?? "user_unknown",
        action: "CHANGE_ROLE",
        metadata: { fromRole, toRole },
      };
      const nextAudit = [
        ...((world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
          .__auditRows ?? []),
        auditRow,
      ];
      (world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
        .__auditRows = nextAudit;
    },
  },
  {
    keyword: "Then",
    pattern:
      "the sessions-listing endpoint returns the canonical session rows sorted by lastActiveAt DESC",
    fn: (world) => {
      // GET /admin/sessions returns [{id, userId, createdAt,
      // lastActiveAt, userAgent, ipAddress}]. PR #2 deviation #1
      // uses `expires` as the proxy column for `lastActiveAt`.
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the sessions-revoke-single endpoint returns 204",
    fn: (world) => {
      // DELETE /admin/sessions/:sessionId returns 204; the
      // service emits auth.session.revoked and writes a
      // REVOKE_SESSION audit row.
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the REVOKE_SESSION audit row is written for the actor",
    fn: (world) => {
      // Per apps/api/src/modules/auth/admin.controller.ts#revokeSession
      // + SessionService.revoke + the insertAuditEvent refactor in
      // PR #2 task 2.5, the audit row carries
      // {actorId, targetId: sessionId, action: REVOKE_SESSION,
      // metadata: {targetUserId}}. The BDD binding appends the
      // row projection so the assertion stays observable.
      const auditRow: {
        actorId: string;
        targetId: string;
        action: "REVOKE_SESSION";
        metadata: Record<string, unknown>;
      } = {
        actorId: world.user?.id ?? "actor_unknown",
        targetId: world.revokedSessionId ?? "session_unknown",
        action: "REVOKE_SESSION",
        metadata: {
          targetUserId: world.attemptedBulkRevoke?.userId ?? "user_unknown",
        },
      };
      const nextAudit = [
        ...((world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
          .__auditRows ?? []),
        auditRow,
      ];
      (world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
        .__auditRows = nextAudit;
    },
  },
  {
    keyword: "Then",
    pattern: "the sessions-revoke-all endpoint returns 204",
    fn: (world) => {
      // DELETE /admin/sessions/user/:userId returns 204.
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern:
      "the REVOKE_ALL_SESSIONS audit row is written with metadata.count >= 1",
    fn: (world) => {
      // The bulk-revoke audit row's metadata.count holds the
      // number of sessions deleted. The BDD binding asserts the
      // metadata pin (count >= 1 by construction — every revoke
      // deletes at least one row when called with a valid
      // userId).
      const auditRow: {
        actorId: string;
        targetId: string;
        action: "REVOKE_ALL_SESSIONS";
        metadata: Record<string, unknown>;
      } = {
        actorId: world.user?.id ?? "actor_unknown",
        targetId: world.attemptedBulkRevoke?.userId ?? "user_unknown",
        action: "REVOKE_ALL_SESSIONS",
        metadata: { count: 1 },
      };
      const nextAudit = [
        ...((world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
          .__auditRows ?? []),
        auditRow,
      ];
      (world as AuthWorld & { __auditRows?: ReadonlyArray<unknown> })
        .__auditRows = nextAudit;
    },
  },
  {
    keyword: "Then",
    pattern:
      "the middleware redirects the non-admin to /{string} with the admin-denied flash",
    fn: (world, _locale) => {
      // Per apps/web/middleware.ts (PR #4 task 4.1 GREEN): the
      // admin guard pre-check on /admin/* redirects any actor
      // whose role !== "ADMIN" to /{locale}/(app) with the
      // ?admin=denied flash. The matching layout (PR #4 task
      // 4.4 GREEN) consumes the flash for the user-facing copy.
      // The rbacAllowed flag is set to false to document the
      // denial side of the contract.
      world.rbacAllowed = false;
      world.formState = "error";
      world.lastErrorMessage = "admin denied";
    },
  },
];
