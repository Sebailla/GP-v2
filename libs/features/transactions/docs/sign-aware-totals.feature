Feature: Sign-aware totals (income vs expense, per-category, threshold alerts)
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md

  Background:
    Given the application is running

  Scenario: Income and expense totals are reported separately
    Given two transactions in the reporting currency: one income of "+100" and one expense of "-40"
    When the totals service computes the summary
    Then income total "100", expense total "40" "reported as a positive magnitude", net "60"

  Scenario: Net matches the difference
    Given two transactions in the reporting currency: one income of "+100" and one expense of "-40"
    When the totals service computes the net
    Then net "60" income total "100" expense total magnitude "40"

  Scenario: Per-category totals group by active category
    Given transactions in two distinct active categories
    When the per-category totals service runs
    Then one subtotal is returned per category, with the category name and the net amount

  Scenario: Soft-deleted categories are excluded from per-category totals
    Given transactions assigned to a soft-deleted category
    When the per-category totals service runs
    Then the soft-deleted category does NOT appear in the result
    And those transactions are excluded from category rollups "still counted in overall income/expense totals"

  Scenario: Threshold exceeded on create emits transactions.threshold.exceeded
    Given a non-deleted category exists
    And a configured threshold "100" for the category
    When the user creates a transaction whose amount exceeds "100"
    Then the transaction is persisted
    And a transactions.threshold.exceeded domain event is published with the category ID and amount

  Scenario: Threshold not crossed produces no event
    Given a non-deleted category exists
    And a configured threshold "100" for the category
    When the user creates a transaction whose amount is at or below "100"
    Then the transaction is persisted
    And no threshold event is published
