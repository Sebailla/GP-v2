Feature: Password reset (forgot + reset, email mocked)
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md
  Decision reference: D-AUTH-2 (mocked email delivery, dev-only mailbox).

  Background:
    Given the application is running

  Scenario: Requesting a reset for a known email
    Given a registered user with a verified email
    When the user submits the forgot-password form at "en"/forgot-password
    Then a single-use reset token is generated and persisted with an expiry
    And a mocked email capture is produced "inspectable in development"
    And the form renders the success state "if this email is registered, you will receive instructions"

  Scenario: Resetting a password with a valid token
    Given a valid, non-expired reset token issued to a known email
    When the user submits the reset-password form at "en"/reset-password with a new password that meets the policy
    Then the stored credential is replaced by the new password's hash
    And the token is marked consumed "cannot be reused"
    And the user is redirected to the sign-in screen with the success state of the reset flow rendered

  Scenario: Resetting with an expired or invalid token
    Given an expired or unknown reset token
    When the user submits the reset-password form
    Then no credential is changed
    And the form renders the error state with a generic "invalid or expired token" message
