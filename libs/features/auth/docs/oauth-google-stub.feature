Feature: Google OAuth login (stubbed happy path)
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md
  Decision reference: D-AUTH-3 (canonical adapter payload layout).

  Background:
    Given the application is running

  Scenario: Stubbed Google callback mints a session
    Given the stub auth server is reachable via the configured NEXTAUTH_URL switch
    And the user is on the sign-in screen at "en"/sign-in
    When the user picks the Google provider and the stub returns a successful callback with a verified email
    Then a session is created for that email "creating the account if it does not exist" via "@auth/prisma-adapter"
    And the user is redirected to the authenticated landing route for the active locale

  Scenario: Stubbed Google callback for a new email creates the account then signs in
    Given no account exists for the supplied email
    When the stub completes the Google callback successfully for that email
    Then a User row is created for the email
    And a session is created for the new user
    And the user is redirected to the authenticated landing route for the active locale

  Scenario: Both providers (Credentials and Google) resolve to the same user record for the same email
    Given a registered user
    When the user signs in via Credentials
    And later signs in via Google OAuth using the same email
    Then both sessions resolve to the same user record
    And "@auth/prisma-adapter" persists both "Account" rows linked to the user
