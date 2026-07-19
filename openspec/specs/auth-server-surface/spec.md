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

## Provenance

Introduced by: module-2-public-auth, 2026-07-17 (slice-3 baseline).
Extended by: module-3-superadmin, 2026-07-18 (admin session mgmt).
