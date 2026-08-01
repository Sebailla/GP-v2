# Auth Specification

> **Domain**: auth
> **Change**: `vertical-slicing-reference-scaffold`
> **Project**: `gastos-personales-reference`
> **Stack reference**: NextAuth v5 (Auth.js) with `@auth/prisma-adapter`, Next.js 15 App Router, NestJS 10
> **Cross-references**: `proposal.md` §2.1.4 (auth edges), §7.4 (G18, G20–G23), §11 (UI-1..UI-4, G40–G47)

## Purpose

Define the behavior the auth slice MUST satisfy in the reference repo. The slice wires NextAuth v5 with `@auth/prisma-adapter`, supports email+password (Credentials) and Google OAuth in parallel, exposes password reset (with mocked email), list+revoke of active sessions, and RBAC roles enforced in the domain layer (not just the UI). The UI surfaces for every screen are reachable through `next-intl` locale-prefixed routes (`/en/...`, `/es/...`), use shadcn-style component primitives, are WCAG AA compliant, and ship complete form states (loading, error, success, empty, validation-error). Every critical screen has at least one component test and one e2e test.

This spec addresses Locked Decisions #2 (provider scope), #5 (OAuth testing strategy), and #8 (auth edges in scope), plus the UI addendum (#11, decisions UI-1..UI-4).

## Requirements

### Requirement: Email and Password Login (Happy Path)

The system MUST authenticate a user against `libs/core/database` when the supplied email exists and the password matches the stored credential. The successful authentication MUST yield an active session for the user, and the UI MUST redirect the user to the authenticated landing route for the active locale.

#### Scenario: Successful sign-in with valid credentials

- GIVEN a registered user with a verified email and a stored password credential
- AND the user is on the sign-in screen at `/{locale}/sign-in` for locale `en` or `es`
- WHEN the user submits the sign-in form with the matching email and password
- THEN a new session is created via `@auth/prisma-adapter`
- AND the user is redirected to the authenticated landing route for the active locale
- AND the success state of the sign-in form is rendered (no raw HTML dump)

### Requirement: Email and Password Login (Invalid Credentials)

The system MUST reject sign-in when the email is unknown OR the password does not match. The error MUST be surfaced in the form's error state in a way that does not disclose whether the email exists.

#### Scenario: Unknown email

- GIVEN no account exists for the supplied email
- WHEN the user submits the sign-in form with that email
- THEN no session is created
- AND the form renders an error state with a generic "invalid credentials" message
- AND the email field remains populated for correction

#### Scenario: Known email, wrong password

- GIVEN a registered user with a verified email
- WHEN the user submits the sign-in form with the correct email but a wrong password
- THEN no session is created
- AND the form renders an error state with the same generic "invalid credentials" message used for the unknown-email case
- AND the password field is cleared

### Requirement: Google OAuth Login (Stubbed Happy Path)

The system MUST support a Google OAuth provider configured in parallel with the Credentials provider. The first-slice coverage MUST be the happy-path stub: when the auth server URL is set to the local stub, a successful simulated callback MUST mint a session for an existing or just-created account. Real OAuth handshake against Google is out of BDD scope (manual/integration only).

#### Scenario: Stubbed Google OAuth completes sign-in

- GIVEN the stub auth server is reachable via the configured `NEXTAUTH_URL` switch
- AND the user is on the sign-in screen at `/{locale}/sign-in`
- WHEN the user picks the Google provider and the stub returns a successful callback with a verified email
- THEN a session is created for that email (creating the account if it does not exist) via `@auth/prisma-adapter`
- AND the user is redirected to the authenticated landing route for the active locale

### Requirement: Password Reset (Forgot + Reset, Email Mocked)

The system MUST expose a forgot-password action that, given a known email, generates a single-use reset token with an expiry, and a reset-password action that accepts the token plus a new password meeting the policy and replaces the stored credential. The delivery of the email is mocked in this repo: the system persists the token and exposes a development-only inspection affordance; no real SMTP integration ships.

#### Scenario: Requesting a reset for a known email

- GIVEN a registered user with a verified email
- WHEN the user submits the forgot-password form at `/{locale}/forgot-password`
- THEN a single-use reset token is generated and persisted with an expiry
- AND a mocked email capture is produced (inspectable in development)
- AND the form renders the success state ("if this email is registered, you will receive instructions")

#### Scenario: Resetting a password with a valid token

- GIVEN a valid, non-expired reset token issued to a known email
- WHEN the user submits the reset-password form at `/{locale}/reset-password` with a new password that meets the policy
- THEN the stored credential is replaced by the new password's hash
- AND the token is marked consumed (cannot be reused)
- AND the user is redirected to the sign-in screen with the success state of the reset flow rendered

#### Scenario: Resetting with an expired or invalid token

- GIVEN an expired or unknown reset token
- WHEN the user submits the reset-password form
- THEN no credential is changed
- AND the form renders the error state with a generic "invalid or expired token" message

### Requirement: Sessions List and Revoke

The system MUST allow an authenticated user to list every active session for their account and revoke any session (including their own other-device sessions). Revoking a session MUST prevent further authenticated requests using that session identifier.

#### Scenario: Listing active sessions

- GIVEN a user with two or more active sessions on different devices
- WHEN the user opens the sessions screen at `/{locale}/sessions`
- THEN all sessions are listed with a user-discernible device label and last-active timestamp
- AND the form/screen renders in its success state (non-empty result)

#### Scenario: Revoking a single session

- GIVEN a user with two active sessions
- WHEN the user revokes one of them from the sessions screen
- THEN that session no longer authenticates subsequent requests
- AND the remaining sessions are unchanged
- AND the sessions list reflects the removal (success state re-rendered)

### Requirement: RBAC Roles Enforced in the Domain Layer

The system MUST support two roles, `admin` and `user`, where authorization decisions (who can read what, who can mutate what) are enforced by the domain service — not by UI gating. The UI MAY hide affordances the user is not entitled to, but the server MUST reject requests that violate the role policy.

#### Scenario: A user role is denied an admin-only action

- GIVEN a session for a user with role `user`
- WHEN the user invokes an admin-only action through `apps/web`
- THEN the domain service rejects the action
- AND no state change persists
- AND the UI renders the error state for the access denial

#### Scenario: An admin role is allowed an admin-only action

- GIVEN a session for a user with role `admin`
- WHEN the admin invokes the same admin-only action
- THEN the domain service accepts the action and persists the change
- AND the UI reflects the success state

### Requirement: Multi-Provider Adapter Wiring

The system MUST register the Credentials provider and the Google OAuth provider against `@auth/prisma-adapter` simultaneously. Adapter-driven side effects (account linking, session persistence) MUST be observed by both providers.

#### Scenario: Both providers share a single adapter-backed account

- GIVEN a registered user
- WHEN the user signs in via Credentials
- AND later signs in via Google OAuth using the same email
- THEN both sessions resolve to the same user record
- AND `@auth/prisma-adapter` persists both `Account` rows linked to the user

### Requirement: Session Lifecycle and Expiry

Sessions MUST expire after the configured TTL. Expired sessions MUST NOT authenticate further requests, and the UI MUST redirect to the sign-in screen when an expired session is detected.

#### Scenario: Expired session blocks an authenticated request

- GIVEN a session older than the configured TTL
- WHEN the user attempts any authenticated action
- THEN the request is rejected as unauthenticated
- AND the user is redirected to `/{locale}/sign-in` for the active locale

### Requirement: Auth Input Validation (Single Source of Truth)

Email and password input MUST be validated by a Zod schema shared between the client form and the server action (no duplicated validators). Submitted values that fail validation MUST be rejected at the form's validation-error state and MUST NOT reach the auth service.

#### Scenario: Malformed email is rejected at the form

- GIVEN the user is on the sign-in screen
- WHEN the user submits the sign-in form with an email that fails the Zod email format
- THEN no network call to the auth service is made
- AND the form renders the validation-error state with an inline message on the email field

### Requirement: UI Primitives (shadcn-style Components)

Every auth screen MUST be built with shadcn-style component primitives installed locally as editable `.tsx` files (Button, Input, Form, Card, Dialog, DropdownMenu, Toast, and any other critical primitives). The primitives MUST be reusable across the auth slice and acceptable to the transactions slice.

#### Scenario: Auth screens compose from the shared primitive set

- GIVEN the installed primitive set under the auth client directory
- WHEN any auth screen is rendered
- THEN every interactive surface (button, input, form control, dropdown, toast) is built from the installed primitives
- AND primitives are imported from a single canonical path shared with the transactions slice

### Requirement: Locale-Prefixed Auth Routing via next-intl

Every auth route MUST be reachable under both `/en/...` and `/es/...`. The active locale MUST drive the rendered language for every user-facing string on the auth screens. The locale switcher MUST preserve the active auth surface (e.g. switching locales while on the sign-in screen keeps the user on the sign-in screen in the new locale).

#### Scenario: Sign-in screen is reachable in both locales

- GIVEN the application is running
- WHEN the user navigates to `/en/sign-in` or `/es/sign-in`
- THEN the sign-in screen renders in English or Spanish respectively
- AND the form labels, button text, and validation messages are translated via `next-intl`

#### Scenario: Switching locale preserves the active auth surface

- GIVEN the user is on `/en/sign-in`
- WHEN the user changes the locale to `es`
- THEN the user lands on `/es/sign-in` (same surface, new locale)
- AND no form data is lost inadvertently

### Requirement: WCAG AA Accessibility for Auth Screens

Every auth screen MUST be WCAG AA compliant: 4.5:1 text contrast, full keyboard navigation, semantic HTML, and ARIA attributes used only when semantic HTML is insufficient. An automated audit using `@axe-core/playwright` MUST pass for each critical screen.

#### Scenario: axe-core audit passes for the sign-in screen

- GIVEN the sign-in screen is rendered at `/{locale}/sign-in`
- WHEN `@axe-core/playwright` runs against the screen
- THEN no AA violations are reported
- AND every interactive element is reachable by tab
- AND every interactive element has an accessible name

### Requirement: Complete Form States on Auth Forms

Every auth form MUST implement the five states: loading, error, success, empty, and validation-error. Raw HTML form dumps are NOT acceptable as a final state — every state MUST be designed.

#### Scenario: Sign-in form transitions through every state

- GIVEN the sign-in screen at `/{locale}/sign-in`
- WHEN the screen renders with no input yet
- THEN the empty state is visible (helpful prompt, no errors)
- WHEN the user submits invalid input
- THEN the validation-error state is rendered inline on the offending field
- WHEN the user submits valid input
- THEN the loading state renders (disabled submit + progress affordance)
- WHEN the response is an authentication failure
- THEN the error state renders with a non-leaking message
- WHEN the response is success
- THEN the navigation to the authenticated landing occurs and the destination renders in its success state

### Requirement: Responsive Auth Layout

Every auth screen MUST render without layout breakage between the mobile (≤640px) and desktop (≥1024px) breakpoints. Intermediate widths MUST NOT cause overflow, hidden controls, or unreadable text.

#### Scenario: Sign-in screen resizes correctly

- GIVEN the viewport changes between 360px and 1440px width
- WHEN the sign-in screen is rendered
- THEN no horizontal overflow occurs at any tested width
- AND every control remains reachable and readable

### Requirement: Component Tests for Auth Screens

Every critical auth screen MUST have at least one Vitest + Testing Library component test covering the happy path. Tests MUST run under `pnpm test` and report green.

#### Scenario: Sign-in component renders the empty state

- GIVEN the sign-in component is mounted in isolation
- WHEN the component test exercises the initial render
- THEN the empty state is visible
- AND the test passes under `pnpm test`

### Requirement: End-to-End Test for the Login Critical Flow

The login → authenticated landing critical flow MUST be exercised by at least one Playwright e2e test that runs under `pnpm turbo run e2e`. The test MUST start from a clean session, complete the sign-in form, and assert the landing page is reached for both locales.

#### Scenario: e2e happy path lands authenticated user in the correct locale

- GIVEN the application is running and a registered user exists
- WHEN the Playwright e2e test navigates to `/{locale}/sign-in`, fills the form, and submits
- THEN the test asserts the authenticated landing route is reached
- AND the landing page is rendered in the requested locale
- AND `pnpm turbo run e2e` exits 0

## Data Model

The auth slice persists identity records through `@auth/prisma-adapter` against `libs/core/database`. The minimum schema elements exposed to the auth slice are listed below. Column types reference Prisma types; refer to the Prisma schema for SQL projection.

| Table                | Column              | Type                | Constraints / Notes                                                                   |
| -------------------- | ------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `User`               | `id`                | `String` (`cuid()`) | Primary key.                                                                          |
| `User`               | `email`             | `String`            | NOT NULL; UNIQUE index (case-insensitive collation handled at the application layer). |
| `User`               | `emailVerified`     | `DateTime?`         | NULL until verified.                                                                  |
| `User`               | `name`              | `String?`           | Display name.                                                                         |
| `User`               | `image`             | `String?`           | Avatar URL.                                                                           |
| `User`               | `passwordHash`      | `String?`           | NULL when the user signs up via OAuth only. Bcrypt/argon2 hash.                       |
| `User`               | `role`              | `enum Role`         | NOT NULL; one of `admin`, `user`. Default `user`.                                     |
| `User`               | `createdAt`         | `DateTime`          | NOT NULL.                                                                             |
| `User`               | `updatedAt`         | `DateTime`          | NOT NULL.                                                                             |
| `Account`            | `id`                | `String` (`cuid()`) | Primary key. Adapter-managed.                                                         |
| `Account`            | `userId`            | `String`            | NOT NULL; FK → `User.id` ON DELETE CASCADE.                                           |
| `Account`            | `provider`          | `String`            | NOT NULL; one of `credentials`, `google`.                                             |
| `Account`            | `providerAccountId` | `String`            | NOT NULL.                                                                             |
| `Account`            | `access_token` etc. | `String?`           | Adapter-managed columns (refresh_token, expires_at, token_type, scope, id_token).     |
| `Session`            | `id`                | `String` (`cuid()`) | Primary key. Adapter-managed.                                                         |
| `Session`            | `userId`            | `String`            | NOT NULL; FK → `User.id` ON DELETE CASCADE.                                           |
| `Session`            | `sessionToken`      | `String`            | NOT NULL; UNIQUE index.                                                               |
| `Session`            | `expires`           | `DateTime`          | NOT NULL.                                                                             |
| `VerificationToken`  | `identifier`        | `String`            | Adapter-managed reset / verification token storage.                                   |
| `VerificationToken`  | `token`             | `String`            | UNIQUE index.                                                                         |
| `VerificationToken`  | `expires`           | `DateTime`          | NOT NULL.                                                                             |
| `PasswordResetToken` | `id`                | `String` (`cuid()`) | Primary key. Used for email-mocked password reset flows.                              |
| `PasswordResetToken` | `userId`            | `String`            | NOT NULL; FK → `User.id` ON DELETE CASCADE.                                           |
| `PasswordResetToken` | `tokenHash`         | `String`            | NOT NULL; UNIQUE index. Hash of the token (raw token never persisted).                |
| `PasswordResetToken` | `expiresAt`         | `DateTime`          | NOT NULL.                                                                             |
| `PasswordResetToken` | `consumedAt`        | `DateTime?`         | NULL until reset succeeds; index `(userId, consumedAt)` for quick reuse checks.       |

Indexes referenced above:

- `User_email_key` — UNIQUE on lowercased `User.email`.
- `Account_provider_providerAccountId_key` — UNIQUE composite on `(provider, providerAccountId)`.
- `Session_sessionToken_key` — UNIQUE on `Session.sessionToken`.
- `VerificationToken_token_key` — UNIQUE on `VerificationToken.token`.
- `PasswordResetToken_tokenHash_key` — UNIQUE on `PasswordResetToken.tokenHash`.

The `Role` enum and the `provider` string values are part of the auth domain contract and MUST be reused by the transactions slice wherever a `createdBy` / `updatedBy` reference is captured (`User.id` FK plus the `role` is read at the domain layer to enforce RBAC).

## Gherkin feature inventory

Per Locked Decision #3 (4–6 `.feature` files per module with shared step defs), the auth module ships:

| File                                                   | High-level scenarios                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/features/auth/docs/login-email-password.feature` | Scenario: Valid credentials sign the user in · Scenario: Unknown email renders generic error · Scenario: Wrong password renders generic error · Scenario: Validation error on malformed email blocks submit · Scenario: Successful sign-in lands on the locale-correct landing. |
| `libs/features/auth/docs/oauth-google-stub.feature`    | Scenario: Stubbed Google callback mints a session · Scenario: Stubbed Google callback for a new email creates the account then signs in · Scenario: Both providers (Credentials and Google) resolve to the same user record for the same email.                                 |
| `libs/features/auth/docs/password-reset.feature`       | Scenario: Forgot-password for a known email persists a token and a mocked email capture · Scenario: Reset-password with a valid token replaces the credential and consumes the token · Scenario: Reset-password with an expired token is rejected.                              |
| `libs/features/auth/docs/sessions-list.feature`        | Scenario: Listing sessions returns every active session with device label · Scenario: Revoking a session prevents further authentication using that session identifier · Scenario: Revocation re-renders the sessions list with the removed entry gone.                         |
| `libs/features/auth/docs/rbac-admin.feature`           | Scenario: A `user` role attempting an admin-only action is denied by the domain service · Scenario: An `admin` role succeeds on the same action · Scenario: RBAC denial surfaces in the UI error state without leaking policy details.                                          |
| `libs/features/auth/docs/login-locale-routing.feature` | Scenario: `/en/sign-in` and `/es/sign-in` both render the sign-in screen in the requested locale · Scenario: Switching locale keeps the user on the same auth surface in the new locale.                                                                                        |

All step definitions live under `libs/features/auth/docs/step-defs/` and are shared across the six feature files. Concrete phrasing of steps is left to `sdd-design`; the requirement-level scenarios above enumerate the test surface the design must reach.

## Decisions

### D-AUTH-1 — Failed-credential error wording

A generic "invalid credentials" message is used for both unknown-email and wrong-password cases. Rationale: avoids leaking account existence while keeping the user corrective flow simple. Trade-off: a real user with multiple accounts loses the trial-and-error signal. Acceptable for a reference repo where the threat model excludes targeted enumeration.

### D-AUTH-2 — Password reset delivery

Email delivery is mocked inside the reference repo (no SMTP integration). Rationale: reduces operational surface area for a spike; the reset token persists with a real expiry so the production migration can swap in an SMTP adapter without contract changes. Documented as out of scope in proposal §2.2.9.

### D-AUTH-3 — Adapter payload layout

Identity records follow the canonical `@auth/prisma-adapter` schema (`User`, `Account`, `Session`, `VerificationToken`) rather than a custom layout. Rationale: keeps the adapter drop-in replaceable and lets the team swap providers (Locked Decision #2) without rewrites. Trade-off: adapters' schema is opinionated; the auth slice follows it.

No deferred decisions from `proposal.md` §8 fall inside the auth slice; both deferred items are resolved in the transactions spec.
