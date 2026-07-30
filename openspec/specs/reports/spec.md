# Spec — Reports Capability (module-6-reports)

> **Author**: Sebastián Illa
> **Created**: 2026-07-29
> **Status**: draft
> **Capability**: `reports` — financial insight over the user's `Transaction` + `Category` data
> **Read-only**: yes (no Prisma writes, no event emission)

## Purpose

Defines the observable behavior of the Reports & Analytics surface: server routes that return pre-aggregated JSON for monthly summary, category breakdown, and period comparison over the user's `Transaction` history, plus a CSV export endpoint, plus a page UI that renders these aggregations. The slice is read-only at the data layer and inherits the existing auth + boundary invariants from `@features/auth` and `@features/transactions`.

The end-user outcome is a `/[locale]/(app)/reports` page that turns "what did I log in" into "what did I spend, where, and compared to what" — enabling budgeting decisions.

## Dependencies

- `@features/auth/server` — `JwtAuthGuard`, session resolution, `userId` injection.
- `@features/transactions/server` — `TransactionRepository.findManyForUser`, `TotalsService`, `CategoryRepository`, `CurrencyRepository`, `FxRateProvider`. **Reports does NOT duplicate any aggregation; it composes on top of these.**
- `@core/database` — Prisma client (used only inside the port impl; not in `ReportsService`).
- `@core/events` — not used (read-only slice).
- `recharts` — added as `apps/web` dependency, used only in `client/` components.
- `next-intl` — locale-aware strings under `apps/web/messages/{en,es}/reports.json`.

## Surface

### Server routes (under `/api/reports/*`)

All routes require authentication via `JwtAuthGuard`. The `userId` is taken from the session and propagated to every query. The max range is 365 days; over that, return 400 Bad Request.

#### `GET /api/reports/summary?fromDate&toDate[&currencyCode]`

Returns `SummaryReport` (single object).

- **Query** (all required, validated by `report-query.schema.ts`):
  - `fromDate` — ISO-8601 date string `YYYY-MM-DD`.
  - `toDate` — ISO-8601 date string `YYYY-MM-DD`.
  - `currencyCode` — optional ISO-4217 code; defaults to user's primary currency.
- **Response** (`ReportsSummary`):
  - `fromDate` (echo of input)
  - `toDate` (echo of input)
  - `currencyCode` (resolved)
  - `income` — `Decimal` string, total income in the range, FX-converted to `currencyCode`.
  - `expense` — `Decimal` string, total expense in the range, sign-aware (negative).
  - `net` — `Decimal` string, `income - expense.abs()`.
  - `transactionCount` — int.
  - `fxFreshness` — `'fresh' | 'stale'`; `'stale'` if any FX rate older than 24h was used.
- **Status codes**:
  - `200 OK` — success.
  - `400 Bad Request` — invalid query, missing `fromDate`/`toDate`, range > 365 days, inverted range.
  - `401 Unauthorized` — no session.
  - `500 Internal Server Error` — unexpected.

#### `GET /api/reports/by-category?fromDate&toDate[&currencyCode]`

Returns `CategoryBreakdownReport[]` (array, ordered by absolute expense DESC).

- **Query**: same as `/summary`.
- **Response element** (`CategoryBreakdownReport`):
  - `categoryId` — cuid.
  - `categoryName` — string, human-readable from `CategoryRepository`.
  - `total` — `Decimal` string, FX-converted sum of transactions in this category in the range.
  - `transactionCount` — int.
  - `share` — number `0..1`, fraction of total expense for this category.
- **Empty range**: returns `[]` (not 404).
- **Status codes**: same as `/summary`.

#### `GET /api/reports/by-period?fromDate&toDate&bucket=week|month[&currencyCode]`

Returns `PeriodComparisonReport`.

- **Query**:
  - `fromDate`, `toDate` — required.
  - `bucket` — enum `'week' | 'month'`, required.
  - `currencyCode` — optional.
- **Response** (`PeriodComparisonReport`):
  - `current` — `PeriodSeries`:
    - `totals` — `ReportsSummary` (the same shape as `/summary`).
    - `buckets` — `Array<{ label: string; fromDate: string; toDate: string; income: Decimal; expense: Decimal; net: Decimal }>`.
  - `previous` — `PeriodSeries` (same shape, computed for the window immediately preceding `fromDate..toDate` with the same duration).
  - `delta` — `{ income: Decimal; expense: Decimal; net: Decimal; netPercent: number }`. `netPercent` is `number`, possibly negative; `Infinity`/`NaN` serialized as `null`.
- **Status codes**: same as `/summary`.

#### `GET /api/reports/export.csv?fromDate&toDate[&detail=transactions][&currencyCode]`

Returns `text/csv; charset=utf-8` stream.

- **Query**:
  - `fromDate`, `toDate` — required.
  - `detail` — optional enum `'summary' | 'transactions'`; default `'summary'`.
  - `currencyCode` — optional.
- **Response**:
  - `Content-Type: text/csv; charset=utf-8`.
  - `Content-Disposition: attachment; filename="reports-<fromDate>-<toDate>[.detail].csv"`.
  - Body: a CSV document.
- **Default mode (`detail=summary`)**:
  - Columns: `category_id,category_name,total,currency_code,transaction_count,share`.
  - One row per category.
  - Last row is `__TOTAL__` with the grand totals.
- **Detail mode (`detail=transactions`)**:
  - Columns: `id,occurred_at,description,category_id,category_name,amount,currency_code,amount_in_primary,primary_currency_code`.
  - One row per transaction.
  - `amount_in_primary` is FX-converted.
- **CSV injection guard**: cells starting with `=`, `+`, `-`, `@` get a single-quote prefix.
- **Encoding**: UTF-8 with BOM (`\xEF\xBB\xBF`) for Excel compatibility.
- **Line endings**: CRLF (`\r\n`).
- **Status codes**: same as `/summary`, plus `404 Not Found` if `categoryId` references a soft-deleted category.

### Page UI

`apps/web/app/[locale]/(app)/reports/page.tsx` is a server component.

- Renders `<h1>` page title via `getTranslations('ReportsPage')`.
- Renders `<ReportsWorkspace />` (client component, lazy-loaded).
- The locale prefix `/en/reports` or `/es/reports` is enforced by the existing `next-intl` middleware; the page does not handle locale resolution itself.

`<ReportsWorkspace />` (client component):
- Holds the date-range filter state (`fromDate`, `toDate`, `bucket`, `currencyCode`).
- Renders 4 cards in order:
  1. `<MonthlySummaryCard />` — calls `/api/reports/summary`, renders `income` / `expense` / `net` + a `<BarChart />` from Recharts.
  2. `<CategoryBreakdownTable />` — calls `/api/reports/by-category`, renders a table with `categoryName`, `total`, `share` (formatted as %).
  3. `<PeriodComparisonPanel />` — calls `/api/reports/by-period`, renders `current.buckets` + `previous.buckets` aligned side-by-side, plus a `<LineChart />` from Recharts showing `net` over the buckets, and a header line "Este período: $X (vs $Y anterior, +Z%)".
  4. `<ExportCsvButton />` — calls `/api/reports/export.csv?detail=summary`, then `?detail=transactions`. Shows two buttons: "Export summary" and "Export transactions".
- Renders the 5 states per AGENTS.md §9: loading, error, success, empty ("No data in this range — create your first transaction"), validation-error (range > 365 days).

## Invariants

1. **Auth required**: every server route returns 401 without a session.
2. **Per-user isolation**: every query filters by `userId` from the session. No cross-user leak. Cross-user leak test is part of the integration suite.
3. **Range cap**: `toDate - fromDate <= 365 days`. Beyond that, 400.
4. **Half-open date range**: `[fromDate, toDate)` — `toDate` is exclusive. Inverted ranges are allowed per design (zero-result probe).
5. **FX freshness**: if any FX rate used in the aggregation is older than 24h, the response carries `fxFreshness: 'stale'`. The UI surfaces a banner.
6. **No writes**: reports must NOT emit any event on `@core/events`, NOT call any Prisma write, NOT mutate any session or audit log.
7. **Locale-aware**: server responses are locale-neutral; the client renders locale-aware strings via `next-intl` catalogs.
8. **CSV safety**: any cell starting with `=`, `+`, `-`, `@` is prefixed with `'`. UTF-8 BOM on the response. CRLF line endings.
9. **No chart on server**: server returns JSON only; Recharts is loaded only in client components.

## Scenarios (Given-When-Then)

### Scenario S1 — Auth required

```
Given an authenticated user with 10 transactions in 2026-06
When the user navigates to /en/reports
Then the page renders the ReportsPage with the ReportsWorkspace
And the four child components mount in their loading state
```

### Scenario S2 — Monthly summary, fresh user

```
Given an authenticated user with 0 transactions in the current month
When the user opens /en/reports
Then the MonthlySummaryCard shows the empty state with the onboarding CTA
And the create-transaction link points to /en/transactions/new
```

### Scenario S3 — Monthly summary, populated

```
Given an authenticated user with 5 transactions in 2026-07 (3 in category "Food", 2 in category "Transport")
And the user's primary currency is USD
When the user requests GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
Then the response contains income=0, expense=-150, net=150, transactionCount=5
And fxFreshness is "fresh"
```

### Scenario S4 — Category breakdown

```
Given the same setup as S3
When the user requests GET /api/reports/by-category?fromDate=2026-07-01&toDate=2026-08-01
Then the response is an array of two CategoryBreakdownReport
And the array is ordered by absolute expense DESC
And the share values sum to 1.0 (within 0.01 rounding)
```

### Scenario S5 — Period comparison with delta

```
Given an authenticated user with:
  - 2026-07-01..2026-07-29: 5 transactions, expense=100
  - 2026-06-02..2026-06-30: 5 transactions, expense=80
When the user requests GET /api/reports/by-period?fromDate=2026-07-01&toDate=2026-07-29&bucket=month
Then the response contains current.net = 100 and previous.net = 80
And delta.netPercent = 0.25 (25% increase)
```

### Scenario S6 — Period comparison, DST-safe

```
Given the user requests a range that crosses a DST boundary in their locale
When the comparison window is computed
Then the comparison window is duration-equivalent (duration in days, not calendar-month-based)
And the dates do not shift by 1 day due to DST
```

### Scenario S7 — Range cap

```
Given an authenticated user
When the user requests GET /api/reports/summary?fromDate=2024-01-01&toDate=2026-01-01
Then the response is 400 Bad Request
And the error message mentions the 365-day cap
```

### Scenario S8 — Inverted range is valid

```
Given an authenticated user
When the user requests GET /api/reports/summary?fromDate=2026-08-01&toDate=2026-07-01
Then the response is 200 OK with empty data (income=0, expense=0, net=0, transactionCount=0)
```

### Scenario S9 — Cross-user isolation

```
Given users A and B, both with authenticated sessions
When user A requests GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
Then the response contains ONLY user A's transactions, never user B's
```

### Scenario S10 — CSV export summary mode

```
Given an authenticated user with 5 transactions in 2 categories for 2026-07
When the user clicks "Export summary"
Then the browser downloads reports-2026-07-01-2026-08-01.csv
And the file has a UTF-8 BOM
And the file has CRLF line endings
And the file has columns: category_id, category_name, total, currency_code, transaction_count, share
And there is one row per category plus a __TOTAL__ row
```

### Scenario S11 — CSV export detail mode

```
Given the same setup as S10
When the user clicks "Export transactions"
Then the browser downloads reports-2026-07-01-2026-08-01.detail.csv
And the file has columns: id, occurred_at, description, category_id, category_name, amount, currency_code, amount_in_primary, primary_currency_code
And there is one row per transaction
```

### Scenario S12 — CSV injection guard

```
Given a user has a transaction with description = "=cmd|'/c calc'!A0"
When the user exports detail mode
Then the description cell in the CSV is prefixed with a single quote: "'=cmd|'/c calc'!A0"
```

### Scenario S13 — FX freshness banner

```
Given an authenticated user with transactions in EUR
And the FX rate for EUR is older than 24 hours
When the user opens /en/reports
Then the response carries fxFreshness="stale"
And the UI shows a banner "FX rates may be stale — figures are approximate"
```

### Scenario S14 — Period comparison DST boundary

```
Given an authenticated user with transactions in a DST-affected locale
When the user requests a period that crosses a DST boundary
Then the comparison window is computed by duration (days), not by calendar-month
And the dates do not shift by 1 day
```

### Scenario S15 — Locale routing

```
Given the user accesses the page from the EN locale prefix
When the page renders
Then all visible strings are in English
And the URL stays at /en/reports (no client-side locale redirect)
```

### Scenario S16 — Vietnamese/Chinese character check

```
Given a Spanish mirror file in Documents-es/openspec/changes/module-6-reports/
When the file is committed
Then it does not contain any CJK character (per the perl regex check on \p{Han})
```

### Scenario S17 — Empty state CTA

```
Given the user has 0 transactions in the selected range
When the ReportsWorkspace renders
Then the empty state copy says "No data in this range"
And a button "Create your first transaction" links to /[locale]/transactions/new
```

### Scenario S18 — Multi-currency aggregation

```
Given the user has transactions in USD and EUR within the range
And the user's primary currency is USD
When the user requests /api/reports/summary
Then the response shows income + expense + net in USD (FX-converted)
And the detail CSV export keeps each transaction's currencyCode and adds amount_in_primary in USD
```

### Scenario S19 — Concurrency (no write contention)

```
Given two browser tabs of the same authenticated user
When both request /api/reports/summary with different ranges
Then both responses return successfully and independently
And neither tab mutates shared state
```

### Scenario S20 — WCAG AA conformance

```
Given the ReportsPage is rendered
When the @axe-core/playwright audit runs
Then no violations of WCAG AA are reported
```

## Compliance

- **AGENTS.md §9 (UI complete, not scaffold)**: 5-state coverage per `client/` component. WCAG AA via @axe-core/playwright. Locale-prefixed routes via `/en/...` and `/es/...`. Component tests + E2E tests per critical surface. No placeholder pages, no stub components.
- **AGENTS.md §4 (Strict TDD)**: every service + controller + service client impl + component written under RED → GREEN → TRIANGULATE → REFACTOR.
- **AGENTS.md §7 (boundary rules)**: Prisma only in `libs/core/database`. Schemas only in `libs/features/reports/shared/schemas/`. No client↔server imports. No cross-module imports; route through `@core/events` or shared ports.
- **AGENTS.md §13 (Spanish mirror)**: every `.md` under `openspec/changes/module-6-reports/` ships with `Documents-es/openspec/changes/module-6-reports/` mirror in the same atomic commit. CJK check passes.
- **AGENTS.md §11 (out of scope)**: no new Prisma tables, no i18n beyond en/es, no observability infra (uses existing M5 wiring), no audit-log UI.

## Next phase

`sdd-design` — the technical design that answers *how* this spec is implemented (file layout, port + service + impl, NestJS wiring, page composition, BDD bridge).
