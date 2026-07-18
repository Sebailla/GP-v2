# NextAuth Web Routes Specification

## Purpose

Defines the observable behavior of the locale-prefixed sign-in surface and NextAuth route handlers exposed by the web app: where the sign-in page lives, how missing locales are defaulted, how already-authenticated users are redirected away from the surface, and how foreign `callbackUrl` values are rejected.

## Requirements

### Requirement: Locale-Prefixed Sign-In Route

The system MUST expose the sign-in route at `/{locale}/sign-in` for every supported locale (`en`, `es`). The rendered page MUST display the `LoginForm` containing both the Google sign-in button (when Google is configured) and the email-and-password form. Every user-facing string on this surface MUST be localized.

#### Scenario: Sign-in renders in the requested locale

- GIVEN the user navigates to `/en/sign-in`
- WHEN the page renders
- THEN labels, button text, and validation messages render in English
- AND the `LoginForm` is the canonical auth form for that surface

#### Scenario: Sign-in renders in Spanish

- GIVEN the user navigates to `/es/sign-in`
- WHEN the page renders
- THEN labels, button text, and validation messages render in Spanish

### Requirement: Locale Defaulting and Authenticated Redirect

The system MUST redirect unauthenticated users with a missing locale to `/en/sign-in` (the locale default). The system MUST redirect already-authenticated users away from the sign-in surface to `/{locale}/(app)` for the active locale.

#### Scenario: Missing locale defaults to English

- GIVEN the user navigates to `/sign-in` (no locale segment)
- WHEN the middleware runs
- THEN the response is a redirect to `/en/sign-in`

#### Scenario: Authenticated user is redirected to the app

- GIVEN an authenticated session cookie is present
- WHEN the user navigates to `/{locale}/sign-in`
- THEN the response is a redirect to `/{locale}/(app)`

### Requirement: Callback URL Validation

The system MUST validate the `callbackUrl` query parameter on the sign-in surface and reject values that point at a foreign origin. Invalid callback URLs MUST land the user on `pages.error` with localized copy; the response MUST NOT silently redirect to an attacker-controlled origin.

#### Scenario: Foreign callback URL is rejected

- GIVEN the user reaches the sign-in surface with `?callbackUrl=https://evil.example/`
- WHEN NextAuth processes the callback URL
- THEN the response redirects to `pages.error` with a localized message
- AND no cookie is set

### Requirement: Admin Route Guard

All routes under `/[locale]/(app)/admin/*` MUST be guarded by `role=ADMIN`. Non-admin users MUST be redirected to `/{locale}/(app)` with a localized flash message ("Acceso denegado" / "Access denied"). Guard runs server-side (page render) AND client-side (middleware redirect).

#### Scenario: Admin visits /admin/users

- GIVEN an authenticated admin
- WHEN they visit `/{locale}/admin/users`
- THEN the admin users page renders

#### Scenario: Admin visits /admin/sessions

- GIVEN an authenticated admin
- WHEN they visit `/{locale}/admin/sessions`
- THEN the admin sessions page renders

#### Scenario: Non-admin redirected

- GIVEN an authenticated non-admin
- WHEN they visit `/{locale}/admin/users`
- THEN they are redirected to `/{locale}/(app)` with a localized flash

#### Scenario: Unauthenticated redirected

- GIVEN no session
- WHEN they visit `/{locale}/admin/users`
- THEN they are redirected to `/{locale}/sign-in`

#### Scenario: Admin visits dynamic detail

- GIVEN an authenticated admin
- WHEN they visit `/{locale}/admin/users/{id}` for an existing user
- THEN the user detail page renders

## Provenance

Introduced by: module-2-public-auth, 2026-07-17 (slice-3 / M1 T1.12 baseline).
Extended by: module-3-superadmin, 2026-07-18 (admin route guard).
