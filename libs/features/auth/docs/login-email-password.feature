Feature: Email and password login (Credentials provider)
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md
  Decision reference: D-AUTH-1 (generic "invalid credentials" copy).

  Background:
    Given the application is running

  Scenario: Valid credentials sign the user in
    Given a registered user with a verified email and a stored password credential
    And the user is on the sign-in screen at "en"/sign-in for locale "en" or "es"
    When the user submits the sign-in form with the matching email and password
    Then a new session is created via "@auth/prisma-adapter"
    And the user is redirected to the authenticated landing route for the active locale
    And the success state of the sign-in form is rendered "no raw HTML dump"

  Scenario: Unknown email renders generic error
    Given no account exists for the supplied email
    When the user submits the sign-in form with that email
    Then no session is created
    And the form renders an error state with a generic "invalid credentials" message
    And the email field remains populated for correction

  Scenario: Wrong password renders generic error
    Given a registered user with a verified email
    When the user submits the sign-in form with the correct email but a wrong password
    Then no session is created
    And the form renders an error state with the same generic "invalid credentials" message used for the unknown-email case
    And the password field is cleared

  Scenario: Validation error on malformed email blocks submit
    Given the user is on the sign-in screen
    When the user submits the sign-in form with an email that fails the Zod email format
    Then no network call to the auth service is made
    And the form renders the validation-error state with an inline message on the email field

  Scenario: Successful sign-in lands on the locale-correct landing
    Given a registered user with a verified email
    And the active locale is "en"
    When the user submits the sign-in form with the matching email and password
    Then the user is redirected to the authenticated landing route for the active locale
