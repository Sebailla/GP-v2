@reports
Feature: Reports & Analytics
  As an authenticated user of the gastos-personales-reference app
  I want a reports surface that summarizes my spending over time
  so that I can budget and review without leaving the app.

  The Reports slice is read-only. No new Prisma tables; the slice
  composes on the existing `Transaction` + `Category` tables via the
  ReportsRepository port. Cross-user isolation is enforced at the
  repository layer (`where: { createdBy: userId }`).

  # ---------------------------------------------------------------
  # Summary endpoint
  # ---------------------------------------------------------------

  Scenario: Auth required (S1)
    Given an authenticated user with role "user"
    When the user requests GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
    Then the response contains a ReportsSummary
    And the response is not an error

  Scenario: Monthly summary, fresh user (S2)
    Given user A has 0 transactions in 2026-07
    When the user requests GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
    Then the summary transactionCount is 0
    And the summary income is "0.00"
    And the summary expense is "0.00"
    And the summary net is "0.00"

  Scenario: Monthly summary, populated (S3)
    Given user A has 5 transactions in 2026-07 with -50.00, -25.00, -10.00, -15.00, -25.00 (all USD)
    And user A primary currency is "USD"
    When the user requests GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
    Then the summary transactionCount is 5
    And the summary expense is "-125.00"
    And the summary income is "0.00"
    And the summary net is "-125.00"

  # ---------------------------------------------------------------
  # Range handling
  # ---------------------------------------------------------------

  Scenario: Range cap (S7)
    Given an authenticated user
    When the user requests GET /api/reports/summary with a range exceeding 365 days
    Then the response is rejected
    And the error mentions the 365-day cap

  Scenario: Inverted range is valid (S8)
    Given user A has 1 transaction in 2026-07
    When the user requests GET /api/reports/summary?fromDate=2026-08-01&toDate=2026-07-01
    Then the summary transactionCount is 0
    And the summary income is "0.00"

  # ---------------------------------------------------------------
  # Cross-user isolation (S9 — the most important scenario)
  # ---------------------------------------------------------------

  Scenario: Cross-user isolation
    Given user A has exactly 2 transactions in 2026-07 totaling -100.00 USD
    And user B has 1 transaction in 2026-07 totaling -999.00 USD
    When the user requests GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
    Then the response contains ONLY user A's transactions
    And the response does NOT contain user B's -999.00 transaction

  # ---------------------------------------------------------------
  # Category breakdown
  # ---------------------------------------------------------------

  Scenario: Category breakdown (S4)
    Given user A has 3 transactions in 2026-07 with -100.00 (cat1 Food), -50.00 (cat2 Transport), -25.00 (cat1 Food)
    When the user requests GET /api/reports/by-category?fromDate=2026-07-01&toDate=2026-08-01
    Then the breakdown has 2 entries
    And the breakdown is ordered by absolute expense DESC
    And the breakdown Food has 2 transactions totaling "-125.00"

  # ---------------------------------------------------------------
  # Period comparison
  # ---------------------------------------------------------------

  Scenario: Period comparison with delta (S5)
    Given user A has 5 transactions in 2026-07 totaling -100.00 USD
    And user A also has 2 transactions in 2026-06 totaling -80.00 USD
    When the user requests GET /api/reports/by-period?fromDate=2026-07-01&toDate=2026-08-01&bucket=month
    Then the current period expense is "-100.00"
    And the previous period expense is "-80.00"
    And the period delta expense is "-20.00"

  Scenario: Period comparison netPercent is null when previous net is zero
    Given user A has 1 transaction in 2026-07 totaling -50.00 USD
    And user A has 0 transactions in 2026-06
    When the user requests GET /api/reports/by-period?fromDate=2026-07-01&toDate=2026-08-01&bucket=month
    Then the period delta netPercent is null

  # ---------------------------------------------------------------
  # CSV export
  # ---------------------------------------------------------------

  Scenario: CSV export summary mode (S10)
    Given user A has 5 transactions in 2 categories in 2026-07
    When the user requests GET /api/reports/export.csv?fromDate=2026-07-01&toDate=2026-08-01&detail=summary
    Then the CSV content type is "text/csv; charset=utf-8"
    And the CSV filename is "reports-2026-07-01-2026-08-01.csv"
    And the CSV body contains the header "category_id,category_name,total,currency_code,transaction_count,share"
    And the CSV body starts with the UTF-8 BOM

  Scenario: CSV export detail mode (S11)
    Given user A has 5 transactions in 2026-07 with -100.00, -50.00, -10.00, -25.00, -15.00 (all USD)
    When the user requests GET /api/reports/export.csv?fromDate=2026-07-01&toDate=2026-08-01&detail=transactions
    Then the CSV filename contains ".transactions.csv"
    And the CSV body contains the header "id,occurred_at,description,category_id,category_name,amount,currency_code,amount_in_primary,primary_currency_code"

  Scenario: CSV injection guard (S12 — CRITICAL)
    Given user A has 1 transaction with description "=cmd|'/c calc'!A0"
    When the user requests GET /api/reports/export.csv?fromDate=2026-07-01&toDate=2026-08-01&detail=transactions
    Then the CSV body contains the literal description prefixed with a single quote
