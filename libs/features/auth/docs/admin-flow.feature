Feature: Vertical superadmin end-to-end flow (Phase 5 — tasks 5.1 + 5.2)
  Spec: openspec/changes/module-3-superadmin/specs/admin-surface/spec.md
  Decision references: D1 (admin guard — server-side authority + client
    middleware pre-check), D2 (audit shape — separate
    AdminAuditEvent table), D5 (self-revoke UX — Set-Cookie clear),
    D6 (route group placement under (app)), D8 (kill-switch via
    ADMIN_ENABLED=false returns 404).

  The canonical vertical scenario for module 3 (Phase 5 PR-5). Walks
  an admin from login through the 5 admin endpoints the controller
  exposes, asserting:

   - admin login lands the actor on the dashboard with role=ADMIN
     pinned for downstream assertions
   - GET /admin/users returns the canonical user listing (paginated,
     sorted DESC by createdAt)
   - POST /admin/users/:userId/role flips a target user's role and
     emits auth.role.changed (per RbacService.changeRole + the
     insertAuditEvent pure fn refactored in PR #2 task 2.5)
   - GET /admin/sessions?userId=<uuid> returns the user's active
     sessions sorted DESC by lastActiveAt (PR #2 deviation #1 uses
     `expires` as the proxy column)
   - DELETE /admin/sessions/:sessionId deletes a single session,
     writes a REVOKE_SESSION audit row, and clears the session
     cookie via Set-Cookie on self-revoke (D5)
   - DELETE /admin/sessions/user/:userId deletes every session for
     the target, writes a REVOKE_ALL_SESSIONS audit row with
     `metadata.count`, and clears the session cookie on
     self-revoke-all
   - the non-admin UX short-circuit — a USER visiting /[locale]/admin
     is redirected to /[locale]/(app) by apps/web/middleware.ts
     with the `?admin=denied` flash

  Vertical E2E scenarios run via Cucumber for the in-process ports
  (apps/api/services, dispatcher, in-memory repos) and via Playwright
  for the browser-bound surface (Next.js admin route group). The
  Cucumber spec at libs/features/auth/docs/admin-flow.feature is
  the BDD anchor; the Playwright spec at
  apps/web/e2e/auth/admin.spec.ts is the browser-bound anchor.

  Background:
    Given the application is running

  @vertical @smoke
  Scenario Outline: Admin login → list users → change role → list sessions → revoke single → revoke all
    Given an admin with role "ADMIN" is signed in via Credentials
    And the admin navigates to "<locale>"/admin/users
    When the admin lists the users page
    Then the user-listing endpoint returns the canonical user rows sorted by createdAt DESC
    When the admin opens the user detail page for "<userId>"
    Then the role-change form renders with the current role pre-selected
    When the admin submits the role-change form with "ADMIN"
    Then the role-change endpoint returns 200 with the updated user row
    And the auth.role.changed event is dispatched with fromRole="USER" and toRole="ADMIN"
    When the admin opens the sessions page for "<userId>"
    Then the sessions-listing endpoint returns the canonical session rows sorted by lastActiveAt DESC
    When the admin revokes a single session for "<userId>"
    Then the sessions-revoke-single endpoint returns 204
    And the REVOKE_SESSION audit row is written for the actor
    When the admin revokes every session for "<userId>"
    Then the sessions-revoke-all endpoint returns 204
    And the REVOKE_ALL_SESSIONS audit row is written with metadata.count >= 1

    Examples:
      | locale | userId                                |
      | en     | 11111111-1111-4111-8111-111111111111  |
      | es     | 22222222-2222-4222-8222-222222222222  |

  @vertical @rbac
  Scenario Outline: Non-admin visiting the admin surface is redirected by the middleware pre-check
    Given a registered user with role "USER" is signed in via Credentials
    When the user navigates to "<locale>"/admin/users
    Then the middleware redirects the non-admin to /<locale> with the admin-denied flash

    Examples:
      | locale |
      | en     |
      | es     |
