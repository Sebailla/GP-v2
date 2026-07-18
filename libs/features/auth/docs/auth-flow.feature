Feature: Vertical public-auth end-to-end flow (Phase 5 — tasks 5.1 + 5.2)
  Spec: openspec/changes/module-2-public-auth/specs/auth-public/spec.md
  Decision references: D2 (reset URL uses {locale}/reset-password/{token}),
    D3 (mail precedence — MAIL_DSN over Gmail), D5 (reset emits HttpOnly
    cookie via @Res passthrough), D6 (locale-keyed email templates),
    D7 (Gmail env fail-fast).

  The canonical vertical scenario for module 2 (Phase 5 PR-5). Walks
  the same user from sign-up through reset, asserting:

   - sign-up creates the account (no enumeration)
   - sign-in with the same credentials lands on /{locale}/(app)
   - forgot-password mints a single-use reset token, dispatched to the
     dev-only mailbox (the in-memory ring buffer at
     apps/web/app/api/dev/mailbox/route.ts)
   - the reset URL minted is locale-prefixed per D2 (/{locale}/reset-password/{token})
   - submitting reset with a valid token returns Set-Cookie: authjs.session-token
     (HttpOnly, SameSite=Lax) and a JSON {redirectTo} payload (D5)
   - after the reset, the page lands on /{locale}/(app) with the session
     cookie active
   - the active locale is preserved on every redirect — en stays en,
     es stays es

  Vertical E2E scenarios run via Cucumber for the in-process ports
  (apps/api/services, dispatcher, in-memory repos) and via Playwright
  for the browser-bound surface (Next.js, reset form, dev mailbox page).
  The Cucumber spec at libs/features/auth/docs/auth-flow.feature is
  the BDD anchor; the Playwright spec at
  apps/web/e2e/auth/vertical-auth.spec.ts is the browser-bound anchor.

  Background:
    Given the application is running

  @vertical @smoke
  Scenario Outline: Sign-up → login → forgot → dev-mailbox → reset → cookie → /[locale]/(app)
    Given a registered user with a verified email and a stored password credential
    And the user is on the sign-in screen at "<locale>"/sign-in
    When the user signs in via Credentials with the same email and password
    Then a new session is created via "@auth/prisma-adapter"
    And the user lands on the dashboard at /<locale>
    When the user submits the forgot-password form at "<locale>"/forgot-password
    Then a single-use reset token is generated and persisted with an expiry
    And the dev mailbox records the reset URL with the active locale
    And the reset URL points to /<locale>/reset-password/<token>
    When the user submits the reset-password form with the new password
    Then the reset endpoint returns 200 with Set-Cookie authjs.session-token HttpOnly SameSite=Lax
    And the user lands on the dashboard at /<locale> after the reset

    Examples:
      | locale |
      | en     |
      | es     |
