Feature: Sessions list and revoke
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md

  Background:
    Given the application is running

  Scenario: Listing active sessions
    Given a user with two or more active sessions on different devices
    When the user opens the sessions screen at "en"/sessions
    Then all sessions are listed with a user-discernible device label and last-active timestamp
    And the form/screen renders in its success state "non-empty result"

  Scenario: Revoking a single session
    Given a user with two active sessions
    When the user revokes one of them from the sessions screen
    Then that session no longer authenticates subsequent requests
    And the remaining sessions are unchanged
    And the sessions list reflects the removal "success state re-rendered"
