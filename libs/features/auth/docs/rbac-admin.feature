Feature: RBAC roles enforced in the domain layer
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md

  Background:
    Given the application is running

  Scenario: A user role is denied an admin-only action
    Given a session for a user with role "user"
    When the user invokes an admin-only action through "apps/web"
    Then the domain service rejects the action
    And no state change persists
    And the UI renders the error state for the access denial

  Scenario: An admin role is allowed an admin-only action
    Given a session for a user with role "admin"
    When the admin invokes the same admin-only action
    Then the domain service accepts the action and persists the change
    And the UI reflects the success state

  Scenario: RBAC denial surfaces in the UI error state without leaking policy details
    Given a session for a user with role "user"
    When the user attempts an admin-only action
    Then the UI error state renders with a generic message
    And no policy-internal details "the action name, the permission matrix" are exposed
