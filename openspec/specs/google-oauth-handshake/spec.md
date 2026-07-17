# Google OAuth Handshake Specification

## Purpose

Defines the observable behavior for signing a user in (or linking an account) via the Google OAuth handshake end to end: from the `/api/auth/callback/google` callback through session cookie set, including runtime gating by Google env config and surface-level error reporting.

## Requirements

### Requirement: Google OAuth Handshake (Happy Path)

The system MUST complete a Google OAuth handshake when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present at runtime and the callback carries a valid authorization code. A successful handshake MUST either link the verified Google email to an existing user record or create a new user record for that email, mint a JWT session, set the session cookie, and redirect the user to `/{locale}/(app)` for the active locale.

#### Scenario: New user signs in with Google

- GIVEN no user record exists for the verified Google email
- AND `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
- WHEN Google redirects to `/api/auth/callback/google` with a valid `code` and `state`
- THEN the system creates a new user record with that email
- AND a JWT session is minted and the session cookie is set
- AND the user is redirected to `/{locale}/(app)` for the active locale

#### Scenario: Existing user links Google to the same email

- GIVEN a user record exists whose email matches the verified Google email
- WHEN the Google callback completes successfully
- THEN no new user record is created
- AND the existing user's `Account` row is linked to the `google` provider
- AND the user is redirected to `/{locale}/(app)` with a fresh session cookie

### Requirement: Google Provider Gating by Runtime Config

The system MUST expose the Google sign-in button only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty. When either is missing the system MUST omit the Google provider from the providers array and the `LoginForm` MUST hide the Google button. No call to the Google OAuth endpoint MUST occur in that case.

#### Scenario: Missing Google credentials hide the button

- GIVEN either `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is unset
- WHEN the user renders the sign-in form
- THEN the `LoginForm` MUST NOT render the Google button
- AND the providers list returned by the auth runtime MUST NOT contain `google`

### Requirement: Google Callback Error Surfaces

The system MUST surface Google callback failures with a localized error copy on `pages.error`. The copy MUST NOT enumerate which side of the handshake failed.

#### Scenario: Google returns access_denied

- GIVEN the user initiates Google sign-in
- WHEN Google redirects back with `error=access_denied`
- THEN the user is redirected to `pages.error` with localized copy in the active locale
- AND no session cookie is set

#### Scenario: Malformed or expired state cookie

- GIVEN the user initiates Google sign-in
- WHEN the callback request reaches `/api/auth/callback/google` with an expired or malformed state cookie
- THEN the response is 401
- AND the user is redirected to `pages.error` with a generic, non-enumerating error message

## Provenance

Introduced by: module-2-public-auth, 2026-07-17; baseline behavior from slice-3 / M1 T1.12.
