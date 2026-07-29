# Auth Server Surface Specification

## Purpose

Defines the observable behavior of the API-side auth wiring that underpins the public authentication module: how the password-reset service composes its email body and how the NextAuth configuration factory exposes its `pages.signIn` route and Google provider, evaluated against runtime credentials.

## Requirements

### Requirement: Locale-Aware Reset Email Body

The `passwordResetService.requestReset()` email body MUST embed the active request locale in the reset URL. The reset URL path shape MUST be `/{locale}/reset-password/<token>`. The `MailAdapter.send` invocation MUST be triggered through the bound `MailAdapter` (Gmail in production, console in dev/test) instead of a slice-3 event-only path.

#### Scenario: Reset URL embeds the active locale

- GIVEN a registered user with email `u@example.com`
- AND the request locale is `es`
- WHEN `PasswordResetService.requestReset("u@example.com")` runs
- THEN the email payload contains a URL whose path begins with `/es/reset-password/`
- AND the raw token is included exactly once

#### Scenario: Reset URL reflects an English locale

- GIVEN the request locale is `en`
- WHEN `requestReset` runs
- THEN the email payload contains a URL whose path begins with `/en/reset-password/`

#### Scenario: Unknown email still mints nothing

- GIVEN no user matches `nobody@example.com`
- WHEN `requestReset("nobody@example.com")` runs
- THEN no token row is created
- AND `MailAdapter.send` is NOT invoked
- AND the call resolves without throwing

### Requirement: NextAuth Config Wired to Locale-Aware Sign-In and Real OAuth

The `buildAuthConfig()` output MUST set `pages.signIn` to the locale-aware factory `/[locale]/sign-in`. The Google provider MUST be registered when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty; the Google sign-in button on the `LoginForm` MUST be visible in lock-step with that registration.

#### Scenario: `pages.signIn` points at the locale route

- GIVEN the API process boots
- WHEN `buildAuthConfig()` runs
- THEN `config.pages.signIn` equals `/[locale]/sign-in` (or the canonical factory that produces the same path)

#### Scenario: Google provider registered only when credentials are set

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both non-empty
- WHEN `buildAuthConfig()` runs
- THEN the providers array contains the `Google` provider
- AND the `LoginForm` Google button is rendered

#### Scenario: Google provider omitted when credentials are missing

- GIVEN either `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is empty
- WHEN `buildAuthConfig()` runs
- THEN the providers array does NOT contain `Google`
- AND the `LoginForm` MUST NOT render the Google button

### Requirement: Session List by User

`GET /admin/sessions?userId=<uuid>` returns sessions sorted DESC by `lastActiveAt` (`id`, `userId`, `createdAt`, `lastActiveAt`, `userAgent`, `ipAddress`). `role=ADMIN` guard.

#### Scenario: Sorted

- GIVEN admin + 3 sessions
- WHEN called
- THEN 200 sorted DESC

#### Scenario: Empty

- GIVEN admin + no sessions
- WHEN called
- THEN 200 with `[]`

#### Scenario: Forbidden role

- GIVEN non-admin
- WHEN called
- THEN 403

#### Scenario: Unknown

- GIVEN admin + unknown userId
- WHEN called
- THEN 404

### Requirement: Revoke Single Session

`DELETE /admin/sessions/:sessionId` deletes the row, dispatches `auth.session.revoked`, inserts `AdminAuditEvent` (`action: "REVOKE_SESSION"`). `role=ADMIN` guard.

#### Scenario: Known

- GIVEN admin + existing session
- WHEN called
- THEN 204, row deleted, audit

#### Scenario: Unknown

- GIVEN admin + unknown sessionId
- WHEN called
- THEN 404, no audit

#### Scenario: Self

- GIVEN admin revoking own session
- WHEN called
- THEN 204 with `Set-Cookie` clearing the token

#### Scenario: Forbidden role

- GIVEN non-admin
- WHEN called
- THEN 403

### Requirement: Revoke All Sessions for User

`DELETE /admin/sessions/user/:userId` deletes every session, inserts `AdminAuditEvent` (`action: "REVOKE_ALL_SESSIONS"`). `role=ADMIN` guard.

#### Scenario: 3 sessions

- GIVEN admin + 3 sessions
- WHEN called
- THEN 204, 3 deleted, `revokedCount: 3`

#### Scenario: 0 sessions

- GIVEN admin + 0 sessions
- WHEN called
- THEN 204, `revokedCount: 0`

#### Scenario: Self

- GIVEN admin revoking own sessions
- WHEN called
- THEN 204, cookie cleared, audit

#### Scenario: Forbidden role

- GIVEN non-admin
- WHEN called
- THEN 403

### Requirement: Session LastActiveAt Update

The system MUST update `Session.lastActiveAt` to the current timestamp on each successful `validateSession(sessionToken)` invocation where the existing `lastActiveAt` is NULL OR was last written more than 60 seconds ago. The update MUST be coalesced (one write per session per 60s window) to bound write amplification on the session-validation hot path. The system MUST use this `lastActiveAt` field for ordering admin session lists (`GET /admin/sessions?userId=<uuid>`) — the previous proxy `expires DESC` is deprecated.

#### Scenario: Update on stale lastActiveAt

- GIVEN a session with `lastActiveAt` older than 60 seconds
- WHEN `validateSession(sessionToken)` succeeds
- THEN `lastActiveAt` is written to the current timestamp
- AND no other session fields change

#### Scenario: Coalesce within 60s window

- GIVEN a session with `lastActiveAt` set 10 seconds ago
- WHEN `validateSession` succeeds a second time
- THEN no write to `lastActiveAt` occurs
- AND the response is identical to the first call

#### Scenario: Self-validation by admin

- GIVEN an admin whose own session has `lastActiveAt` older than 60 seconds
- WHEN `validateSession` succeeds on that session
- THEN the coalesce + write behavior applies identically

#### Scenario: Skip when lastActiveAt is fresh

- GIVEN a session with `lastActiveAt` set 5 seconds ago
- WHEN `validateSession` succeeds
- THEN no write to `lastActiveAt` occurs

#### Scenario: Admin list ordered by lastActiveAt DESC

- GIVEN an admin and a user with multiple sessions (some with `lastActiveAt`, some without)
- WHEN the admin calls `GET /admin/sessions?userId=<uuid>`
- THEN the array is sorted DESC by `lastActiveAt`
- AND sessions with `lastActiveAt IS NULL` sort last

### Requirement: Session List Projection

The `GET /admin/sessions?userId=<uuid>` response MUST return each session as a JSON object with the following fields: `id` (string UUID), `userId` (string UUID), `createdAt` (ISO 8601 timestamp), `lastActiveAt` (ISO 8601 timestamp OR null), `userAgent` (string, max 512 chars OR null), `ipAddress` (string, max 64 chars HMAC hash OR null). The previous projection `{ id, userId, sessionToken, expires }` is deprecated — the controller no longer exposes `sessionToken` to admin clients, and the response uses the spec-literal shape.

#### Scenario: Spec-literal projection

- GIVEN an admin and a user with active sessions
- WHEN the admin calls `GET /admin/sessions?userId=<uuid>`
- THEN 200 is returned with an array of objects containing exactly the 6 spec-literal fields
- AND `sessionToken` is NOT present in any object

#### Scenario: Empty list

- GIVEN an admin and a user with no sessions
- WHEN the admin calls `GET /admin/sessions?userId=<uuid>`
- THEN 200 is returned with `[]`

#### Scenario: User-agent truncated to 512 chars

- GIVEN a session with a `userAgent` longer than 512 characters
- WHEN the admin lists sessions
- THEN the response's `userAgent` is truncated to 512 characters

#### Scenario: IP rendered as HMAC hex

- GIVEN a session with a captured `ipAddress`
- WHEN the admin lists sessions
- THEN the response's `ipAddress` is the 64-char lowercase HMAC-SHA256 hex digest
- AND the raw IP is NOT present in the response

### Requirement: BCRYPT Cost Factor (Production Override)

The system MUST support an env var `BCRYPT_COST_FACTOR_OVERRIDE` (positive integer ≥ 4, default unset). When unset, the system MUST use `BCRYPT_COST_FACTOR = 12` (per the productionized reference repo's design contract). When set, the system MUST validate the override as a positive integer ≥ 4 via Zod and use it directly. The override MUST NOT be settable to values below 4 (defensive floor). The boot sequence MUST verify the override is wired through a startup test.

#### Scenario: Default production cost

- GIVEN `BCRYPT_COST_FACTOR_OVERRIDE` is unset
- WHEN the system boots
- THEN the bcrypt cost factor used for new hashes is 12

#### Scenario: Explicit override 14

- GIVEN `BCRYPT_COST_FACTOR_OVERRIDE=14`
- WHEN the system boots
- THEN the bcrypt cost factor used for new hashes is 14

#### Scenario: Invalid override zero

- GIVEN `BCRYPT_COST_FACTOR_OVERRIDE=0`
- WHEN the system boots
- THEN env validation fails with a 400-friendly Zod error

#### Scenario: Invalid override negative

- GIVEN `BCRYPT_COST_FACTOR_OVERRIDE=-1`
- WHEN the system boots
- THEN env validation fails with a Zod error

#### Scenario: Invalid override non-integer

- GIVEN `BCRYPT_COST_FACTOR_OVERRIDE=abc`
- WHEN the system boots
- THEN env validation fails with a Zod error

#### Scenario: Invalid override too low

- GIVEN `BCRYPT_COST_FACTOR_OVERRIDE=3`
- WHEN the system boots
- THEN env validation fails with a Zod error (defensive floor)

### Requirement: Observability Metrics for Auth Operations

The system MUST emit the following Prometheus-compatible counters to the existing `GET /metrics` endpoint (per M1 R-PF-9):

- `auth_login_success_total` (counter, labeled `email_domain`) — incremented on each successful login.
- `auth_login_failure_total` (counter, labeled `reason`, `email_domain`) — incremented on each failed login with `reason` in `{invalid_credentials, rate_limited, account_locked, unknown}`.
- `auth_password_reset_requested_total` (counter) — incremented on each password reset request.
- `auth_password_reset_completed_total` (counter) — incremented on each successful reset.
- `auth_admin_operation_total` (counter, labeled `operation`, `actor_role`) — incremented on each admin operation; `operation` in `{list_users, change_role, list_sessions, revoke_session, revoke_all_sessions, list_audit, purge_audit_dry_run, purge_audit_real}`; `actor_role` in `{ADMIN}`.
- `auth_session_validations_total` (counter) — incremented on each successful session validation.
- `auth_session_validations_failed_total` (counter) — incremented on each failed session validation.

All metric labels MUST redact sensitive data: no email addresses, no userIds, no IPs. The `email_domain` label carries only the registered domain part (e.g., `gmail.com` from `alice@gmail.com`).

#### Scenario: Login success counter increments

- GIVEN an admin with email at registered domain `example.com`
- WHEN the admin completes a successful login
- THEN `auth_login_success_total{email_domain="example.com"}` is incremented by 1

#### Scenario: Login failure counter increments

- GIVEN a caller with email at registered domain `example.com`
- WHEN the caller submits wrong credentials
- THEN `auth_login_failure_total{reason="invalid_credentials", email_domain="example.com"}` is incremented by 1

#### Scenario: Admin op counter increments

- GIVEN an admin
- WHEN the admin lists users via `GET /admin/users`
- THEN `auth_admin_operation_total{operation="list_users", actor_role="ADMIN"}` is incremented by 1

#### Scenario: Purge dry-run counter increments

- GIVEN an admin
- WHEN the admin posts `{ dryRun: true, olderThanDays: 90 }` to `POST /admin/audit/purge`
- THEN `auth_admin_operation_total{operation="purge_audit_dry_run", actor_role="ADMIN"}` is incremented by 1

#### Scenario: Session validation counter increments

- GIVEN a user with a valid session
- WHEN the user loads the dashboard and `validateSession` succeeds
- THEN `auth_session_validations_total` is incremented by 1

#### Scenario: Privacy — no email in label values

- GIVEN an admin completes a successful login with email `alice@example.com`
- WHEN a metrics scrape reads `GET /metrics`
- THEN no label value contains `@`

#### Scenario: Privacy — no IP label exposed

- GIVEN any auth operation
- WHEN a metrics scrape reads `GET /metrics`
- THEN no metric carries an `ip_address` label

## Provenance

Introduced by: module-2-public-auth, 2026-07-17 (slice-3 baseline).
Extended by: module-3-superadmin, 2026-07-18 (admin session mgmt).
Extended by: module-4-privacy, 2026-07-19 (2 NEW requirements: Session LastActiveAt Update + Session List Projection).
Extended by: module-5-production-hardening, 2026-07-20 (2 NEW requirements: BCRYPT Cost Factor (Production Override) + Observability Metrics for Auth Operations).
