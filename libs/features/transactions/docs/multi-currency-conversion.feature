Feature: Multi-currency storage and conversion (with FX-staleness warning)
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md
  Decision reference: D-TX-2 (FxRateProvider port), D-TX-3 (same-currency no-op), D-TX-4 (stale rate does not block).

  Background:
    Given the application is running

  Scenario: Cross-currency write computes reportingAmount from the FX rate
    Given a non-deleted category exists
    And a known currency code "ARS"
    And a recent FxRate for "ARS" to "USD"
    When a transaction is created against that pair
    Then the transaction is persisted with nativeAmount "1000", nativeCurrency "ARS", and reportingAmount computed from the FX rate
    And the success state is rendered with the converted amount visible

  Scenario: Same-currency write skips FX lookup
    Given a non-deleted category exists
    And the user has reporting currency "USD"
    When the user creates a transaction with amount "50.00" "USD"
    Then the reportingAmount equals the nativeAmount "no FX lookup performed"

  Scenario: Stale rate (>24h) persists the transaction AND emits fxRate.stale
    Given a non-deleted category exists
    And a known currency code "ARS"
    And an FxRate for the relevant currency pair whose recordedAt is older than 24 hours
    When a transaction is created against that pair
    Then the transaction is persisted
    And a transactions.fx.stale domain event is published with the pair and the staleness duration
    And the success state of the form includes a visible "rate is stale" affordance

  Scenario: Fresh rate emits no stale warning
    Given a non-deleted category exists
    And a known currency code "ARS"
    And an FxRate for the relevant currency pair whose recordedAt is within 24 hours
    When a transaction is created against that pair
    Then no transactions.fx.stale event is published
    And no warning is rendered
