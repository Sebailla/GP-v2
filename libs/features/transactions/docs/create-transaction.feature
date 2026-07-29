Feature: Create transaction (validation + persistence)
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md
  Decision reference: D-TX-5 (soft-delete filter non-opt-out), D-TX-6 (Decimal over BigInt).

  Background:
    Given the application is running

  Scenario: Valid input is accepted
    Given a non-deleted category exists
    And the user has reporting currency "USD"
    When the user submits the create-transaction form for the active locale
    Then the transaction is persisted
    And the success state of the form is rendered

  Scenario: Non-positive amount is rejected
    Given a non-deleted category exists
    And the user has reporting currency "USD"
    When the form is submitted
    Then no transaction is created
    And the validation-error state is rendered on the amount field

  Scenario: Unknown currency is rejected
    Given a non-deleted category exists
    When the user creates a transaction with amount "10.00" "ZZZ"
    Then no transaction is created
    And the validation-error state is rendered on the currency field

  Scenario: Soft-deleted category is rejected
    Given a category that has been soft-deleted
    When the user attempts to create a transaction against that category
    Then no transaction is created
    And the form renders the error state with a "category not available" message
