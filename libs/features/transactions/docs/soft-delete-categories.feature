Feature: Soft-delete filter on all Category queries
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md
  Decision reference: D-TX-5 (soft-delete filter is non-opt-out).

  Background:
    Given the application is running

  Scenario: Active categories appear in selectors
    Given a mixture of active and soft-deleted categories
    When the user opens the create-transaction form
    Then only active categories are returned

  Scenario: Soft-deleted categories are filtered from selectors AND from transactions list/totals
    Given a mixture of active and soft-deleted categories
    And transactions assigned to a soft-deleted category
    When the user opens the create-transaction form
    Then only active categories are returned
    And the soft-deleted category does NOT appear in the result
    And those transactions are excluded from category rollups "still counted in overall income/expense totals"

  Scenario: Attempting to attach a soft-deleted category to a new transaction is rejected
    Given a category that has been soft-deleted
    When the user attempts to create a transaction against that category
    Then no transaction is created
    And the form renders the error state with a "category not available" message
