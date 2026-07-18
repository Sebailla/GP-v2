# Password Reset User Flow Specification

## Purpose

Defines the observable behavior for the end-to-end password reset flow: `POST /auth/forgot-password` → locale-aware email → user clicks the reset link → `POST /auth/reset-password` → new credential → fresh session → app redirect.

## Requirements

### Requirement: Forgot-Password Submission

The system MUST accept `POST /auth/forgot-password` with an email payload, invoke the bound `MailAdapter` to deliver a locale-aware reset email when the email is registered, and respond 200 regardless of whether the email is registered (to prevent enumeration).

#### Scenario: Registered email triggers a locale-aware reset email

- GIVEN a user with email `u@example.com` exists
- AND the request `Accept-Language` (or explicit locale param) is `es`
- WHEN the client posts `{ "email": "u@example.com" }` to `/auth/forgot-password`
- THEN the response is 200
- AND the `MailAdapter.send` is invoked exactly once
- AND the email body contains a reset URL whose path begins with `/es/reset-password/`

#### Scenario: Unknown email is silently ignored

- GIVEN no user exists for `nobody@example.com`
- WHEN the client posts `{ "email": "nobody@example.com" }` to `/auth/forgot-password`
- THEN the response is 200
- AND `MailAdapter.send` is NOT invoked

### Requirement: Reset-Password Token Consumption

The system MUST accept `POST /auth/reset-password` with `{ token, password }`. On success the token MUST be marked consumed (single-use), the stored credential MUST be replaced, a session cookie MUST be set, and the user MUST be redirected to `/{locale}/(app)`.

The reset URL a user clicks through to `GET /[locale]/reset-password/<token>` MUST render the localized reset form before any submission.

#### Scenario: Valid token replaces credential and signs the user in

- GIVEN a non-expired, non-consumed reset token issued to a known email
- WHEN the client posts `{ "token": "<raw>", "password": "<policy-compliant>" }` to `/auth/reset-password`
- THEN the stored password hash is replaced
- AND the token is marked consumed
- AND the session cookie is set
- AND the response redirects to `/{locale}/(app)` for the active locale

#### Scenario: Expired token is rejected

- GIVEN a reset token whose `expiresAt` is in the past
- WHEN the client posts a reset-password request with that token
- THEN the response is 400 with a "token expired" localized message
- AND no credential change persists

#### Scenario: Malformed token is rejected generically

- GIVEN an unknown or syntactically invalid token
- WHEN the client posts a reset-password request with that token
- THEN the response is 400 with a generic "invalid token" localized message
- AND the error copy MUST NOT reveal whether the token existed or expired

### Requirement: Reset Email Delivery Failure

The system MUST respond 502 to the client when the bound `MailAdapter.send` rejects on the forgot-password path. The failure MUST be logged via `@core/logging` with the email address redacted. The `ConsoleMailAdapter` binding used in `development` and `test` MUST NOT propagate a synthetic send failure to the client.

#### Scenario: Gmail SMTP failure surfaces 502

- GIVEN `NODE_ENV=production` with the mail runtime bound to the Gmail adapter
- AND the underlying SMTP transport rejects `send`
- WHEN the client posts to `/auth/forgot-password`
- THEN the response is 502 with a generic localized error
- AND the structured log line contains the redacted email and the SMTP error code

#### Scenario: Console binding in dev/test is unaffected

- GIVEN `NODE_ENV=development`
- AND the mail runtime bound to the console adapter
- WHEN the client posts to `/auth/forgot-password` for a registered email
- THEN the response is 200 and the rendered console line includes the locale-aware reset URL

## Provenance

Introduced by: module-2-public-auth, 2026-07-17; baseline behavior from slice-3 / M1 T1.12.
