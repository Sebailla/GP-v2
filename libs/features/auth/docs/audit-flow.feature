Feature: Vertical admin audit-log + retention flow (Phase 4 — tasks 4.1 + 4.2)
  Spec: openspec/changes/module-4-privacy/specs/audit-log-ui/spec.md
  Decision references: D1 (Session.lastActiveAt coalesce),
    D2 (retention cron pattern), D3 (audit query filter shape),
    D4 (purge dual-mode contract), D6 (IP HMAC redaction),
    D7 (session projection deprecation), D8 (retention env contract).

  The canonical vertical scenario for module 4 (Phase 4 PR #4).
  Walks an admin from login through the audit-log surface, the
  filter bar, the REVOKE_SESSION row they themselves produced,
  and the dual-mode retention purge. The scenario asserts:

   - admin login lands the actor on the dashboard with
     role=ADMIN pinned for downstream assertions
   - GET /admin/audit returns the canonical 8-field audit-event
     shape per the audit-log-ui spec "List Audit Events"
   - filtering by actorId=<self.id> returns ONLY that admin's
     rows (the dynamic Prisma where clause per D3)
   - the admin's own REVOKE_SESSION row appears with the spec-
     literal fields (HMAC ipAddress, metadata.sessionId, etc.)
   - POST /admin/audit/purge with dryRun=true returns
     { matched, wouldDelete } and DOES NOT touch rows
   - POST /admin/audit/purge with dryRun=false returns
     { matched, deleted } and atomically removes the rows
   - a second dry-run with the same olderThanDays returns 0
     (idempotency per design D4 + threat matrix retention row)

  Vertical E2E scenarios run via Cucumber for the in-process
  ports (apps/api/services, dispatcher, in-memory repos) and via
  Playwright for the browser-bound surface (Next.js admin route
  group). The Cucumber spec at
  libs/features/auth/docs/audit-flow.feature is the BDD anchor;
  the Playwright spec at apps/web/e2e/auth/audit.spec.ts is the
  browser-bound anchor.

  Background:
    Given the application is running

  @vertical @audit
  Scenario Outline: Admin login → list audit → filter by actorId → see own REVOKE_SESSION → dry-run purge → real purge → verify deletion
    Given an admin with role "ADMIN" is signed in via Credentials
    And the admin navigates to "<locale>"/admin/audit
    When the admin lists the audit events
    Then the audit-listing endpoint returns the canonical 8-field audit rows sorted by createdAt DESC
    When the admin filters the audit by actorId "<actorId>"
    Then the filtered audit query returns only rows for actorId "<actorId>"
    And the filtered response includes the admin's own REVOKE_SESSION row
    When the admin dry-runs the audit purge with olderThanDays "1"
    Then the audit-purge endpoint returns matched > 0 with wouldDelete equal to matched
    And no rows were deleted by the dry-run
    When the admin commits the audit purge with olderThanDays "90"
    Then the audit-purge endpoint returns matched > 0 with deleted equal to matched
    When the admin dry-runs the audit purge with olderThanDays "90" once more
    Then the audit-purge endpoint returns matched 0 with wouldDelete 0
    And the audit table no longer contains rows older than 90 days

    Examples:
      | locale | actorId                               |
      | en     | 11111111-1111-4111-8111-111111111111   |
      | es     | 22222222-2222-4222-8222-222222222222   |

  @vertical @audit @rbac
  Scenario Outline: Non-admin attempting the audit purge is rejected by the AdminGuard
    Given a registered user with role "USER" is signed in via Credentials
    When the user invokes an admin-only action through "audit-purge"
    Then the rbac.denied event is dispatched
    And the audit-purge endpoint returns 403

    Examples:
      | locale |
      | en     |
      | es     |
