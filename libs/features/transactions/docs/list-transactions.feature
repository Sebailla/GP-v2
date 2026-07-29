Feature: Listing, pagination, and filtering
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md
  Decision reference: D-TX-5 (soft-delete filter non-opt-out).

  Background:
    Given the application is running

  Scenario: Paginated listing returns a page of results
    Given more transactions than the page size
    When the user requests page "1" with the configured page size
    Then at most "20" rows are returned
    And the response includes a total count and a cursor for the next page

  Scenario: Empty data set renders the empty state with total 0
    Given the application is running
    When the user requests page "1" with the configured page size
    Then an empty result set is returned with total 0

  Scenario: Filter by category excludes soft-deleted categories
    Given a category "Removed" that has been soft-deleted
    When the user requests a list filtered by "cat_removed"
    Then an empty result set is returned with total 0
