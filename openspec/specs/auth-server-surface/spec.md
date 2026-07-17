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

## Provenance

Introduced by: module-2-public-auth, 2026-07-17; baseline behavior from slice-3 / M1 T1.12.
