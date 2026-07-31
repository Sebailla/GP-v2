# Proposal — module-6-reports (Reports & Analytics)

> **Author**: Sebastián Illa
> **Created**: 2026-07-29
> **Status**: proposed (orchestrator marks archived after apply + verify)
> **Branch**: `feat/module-6-reports` (cut from `develop` @ `da81865`)
> **Artifact store**: hybrid (OpenSpec files + Engram observations)
> **Strict TDD**: ACTIVE (per `openspec/config.yaml` strict_tdd: true)
> **Delivery strategy**: auto-chain (per SDD preflight; this slice is forecast >400 lines)
> **Review budget**: 400 lines

## Intent

Add a Reports & Analytics vertical slice to `gastos-personales-reference`. The user-facing outcome is a `/[locale]/(app)/reports` page that shows pre-aggregated insight over the user's existing `Transaction` + `Category` data: monthly summary, category breakdown with period comparison, and a CSV export. This is the first user-facing capability that delivers *insight* rather than *capture* — closing the gap between "I logged my transactions" and "I understand where my money goes".

The slice is **read-only at the data layer**: no new Prisma tables, no migrations, no schema changes. Reports reuse the existing `TransactionRepository.findManyForUser(userId, range)` port via `@features/transactions` for the raw read seam. The new code is a thin composition layer (TimeBucketService + reports controllers + page UI + BDD) on top of the read seam, plus its own in-service aggregation helpers.

> **Amendment (PR #6 follow-up)**: the original proposal committed to reusing `TotalsService` from `@features/transactions` to avoid duplicating aggregation. Investigation showed this is **not feasible** by construction: `TotalsService` operates over `Transaction` entities with `kind: 'income' | 'expense'` (sign-encoded in the row), while reports aggregate over `TransactionForReport` projections where `amount` is already a sign-aware `Decimal` string **after FX conversion** to the user's primary currency. The two data models are not interchangeable; reports' aggregation is a different operation (post-FX, sign-on-amount) that the `TotalsService` API cannot consume without either coupling it to the FX layer or duplicating the port surface. The in-service `ReportsService.aggregateTotals` is the correct, minimal implementation. See `design.md` §"Architecture decisions" decision #1 amendment for the full rationale.

## Scope (in-scope)

- Capability spec at `openspec/specs/reports/spec.md` (and ES mirror).
- Vertical slice under `libs/features/reports/` with the canonical split:
  - `shared/schemas/` — Zod schemas for query/response: `report-query.schema.ts`, `report-summary.schema.ts`, `report-by-category.schema.ts`, `report-by-period.schema.ts`.
  - `server/` — port `ReportsRepository` (read-only aggregation entry point) + `TimeBucketService` (weekly/monthly grouping) + `ReportsService` (orchestrates queries → returns `SummaryReport`, `CategoryBreakdownReport`, `PeriodComparisonReport`) + `ReportsController` + NestJS module wiring.
  - `client/` — React components: `ReportsFilterBar`, `MonthlySummaryCard`, `CategoryBreakdownTable`, `PeriodComparisonPanel`, `ExportCsvButton`, plus loading/error/empty/success state wrappers.
  - `docs/` — BDD feature `reports.feature` + step definitions + `realm.steps.ts` binding.
- API routes under `/api/reports/*`:
  - `GET /api/reports/summary?fromDate&toDate` → `SummaryReport`.
  - `GET /api/reports/by-category?fromDate&toDate` → `CategoryBreakdownReport[]`.
  - `GET /api/reports/by-period?fromDate&toDate&bucket=week|month` → `PeriodComparisonReport`.
  - `GET /api/reports/export.csv?fromDate&toDate[&detail=transactions]` → CSV stream.
- Page UI at `apps/web/app/[locale]/(app)/reports/page.tsx` (server component, locale-aware) consuming `client/` components. *(Numeric `<Stat>` cards only — no chart library; see Recharts amendment in design.md §"Visualization".)*
- Strict TDD: RED → GREEN → TRIANGULATE → REFACTOR for every service + controller + component.
- BDD coverage for the 4 user flows (summary, breakdown, comparison, CSV export).
- Component tests (Vitest) for every `client/` component, 5-state coverage per AGENTS.md §9.
- E2E (Playwright) for one critical flow per locale (`/en/reports` and `/es/reports`).
- Accessibility patterns shipped (semantic HTML, `aria-live`, associated labels); the automated WCAG AA audit via `@axe-core/playwright` is covered by `apps/web/e2e/reports.spec.ts` and locked to `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa`.
- Spanish mirror of every `.md` under `openspec/changes/module-6-reports/` in `Documents-es/openspec/changes/module-6-reports/` (per AGENTS.md §13). Chinese-character check on the Spanish files: `grep -P '[\x{4e00}-\x{9fff}]'` returns empty.
- 60% per-package coverage on the new `libs/features/reports/{shared,server,client}` packages (per `openspec/config.yaml`, soft target).

## Out of scope

- New Prisma tables or migrations.
- Recurring transactions / cron / scheduler.
- Multi-account / wallets (a separate slice would need a `Account` table + `transaction.accountId` FK + a migration).
- Multi-user / shared budgets (per AGENTS.md §11).
- PDF export (CSV only, in scope).
- Tax reports / fiscal-year reporting.
- Forecast / predictive charts (no ML, no extrapolation).
- Admin-side reports (e.g., global MRR, per-user activity). Reports are user-facing.
- Push notifications for budget threshold breaches (the `ThresholdService` server-side exists but UI integration is a separate slice).
- Other chart libraries (no chart library in this slice — numeric `<Stat>` cards only; see Recharts amendment in design.md §"Visualization").
- Anomaly detection / outlier highlighting.
- Tagging transactions (a separate slice).

## Surface (read / write)

**Read** (existing tables):
- `Transaction` (via `TransactionRepository.findManyForUser`)
- `Category` (via `CategoryRepository`)
- `Currency`, `FxRate` (via `CurrencyRepository`, `FxRateRepository`)

**Write**: nothing. Reports is a read-only slice.

## Architecture decisions

1. **In-service aggregation in `ReportsService` (NOT delegated to `TotalsService`)** — *amended from original "reuse TotalsService" intent*. The original decision was to delegate per-category + per-user totals to `TotalsService` from `@features/transactions` to avoid the trap of two implementations diverging. This is **not feasible** by construction: `TotalsService` consumes `Transaction` (with `kind: 'income' | 'expense'`, sign encoded in the row) and `Decimal` amounts in the original currency; `ReportsService` consumes `TransactionForReport` (with sign-aware `amount: string`, already FX-converted to the user's primary currency). The two data shapes are not interchangeable, and reports' aggregation is intrinsically *post-FX-conversion* — different operation. The `ReportsService.aggregateTotals` helper is the correct, minimal implementation; the original "divergence risk" doesn't apply because the two aggregations answer different questions (per-user undifferentiated totals vs FX-normalized per-user / per-category / per-period totals).
2. **New `TimeBucketService` in `libs/features/reports/server/src/domain/`** — pure domain logic for weekly/monthly grouping. RED-testable, no I/O, no Prisma. Takes `Transaction[]` and `bucket: 'week' | 'month'`; returns `Bucket[]`.
3. **Schemas in `libs/features/reports/shared/schemas/`** — strict Zod schemas, one per query/response shape. Mirror the canonical list schema's shape: cursor pagination + half-open `[fromDate, toDate)` + ISO-4217 `currencyCode`.
4. **Server routes return pre-aggregated JSON**; the client renders numeric `<Stat>` cards and a comparison table (no chart library — see Recharts amendment in design.md §"Visualization"). No CSV generation on the client.
5. **All `/api/reports/*` endpoints require authenticated session** via the existing `JwtAuthGuard`; every query filters by `userId` from the session. No admin-only endpoints.
6. **CSV export endpoint** at `GET /api/reports/export.csv?fromDate&toDate[&detail=transactions]`. Default mode = summary rows (one per category). With `?detail=transactions` = line items (one row per transaction). CSV injection guard: cells starting with `=`, `+`, `-`, `@` get a single-quote prefix.
7. **Page UI is a server component** with `getTranslations` + page header, and the filter + table area is a client component (`<ReportsWorkspace />`). Locale-aware; uses `next-intl` catalogs under `apps/web/messages/{en,es}/reports.json`.
8. **FX normalization to primary currency** — all aggregations convert via `FxRateProvider` (existing). The user's primary currency comes from `CurrencyRepository.findPrimaryForUser(userId)` (new method on the existing port; if missing, default to USD with a console warn + observability counter). Detail CSV export keeps `currencyCode` per row.
9. **Period comparison** — comparison window = the same-duration window immediately preceding the primary range. So if `fromDate=2026-07-01&toDate=2026-07-29`, comparison = `2026-06-02..2026-06-30` (29 days back). The response carries `current` + `previous` + `delta` (absolute + percent) so the client renders "Este período: $X vs $Y anterior (+Z%)".
10. *(Removed — see Recharts amendment in design.md §"Visualization".)*
11. **Boundary rules** enforced via `tools/eslint-plugin-boundary/`: schemas in `shared/`, port + service + impl in `server/`, components in `client/`, BDD in `docs/`. Reports does NOT import from `apps/web/` (one-way: web imports from features). Reports does NOT import from `apps/api/` (server-side uses the NestJS module from `apps/api/src/modules/reports/` which imports from `@features/reports/server`).
12. **No new events emitted on `@core/events`** — reports is read-only, no audit signal needed for a user looking at their own data. If compliance later requires CSV-export audit, that's a follow-up.

## Capabilities

- **New**: `openspec/specs/reports/spec.md` — capability spec for Reports & Analytics.
- **Touched (read)**: `openspec/specs/auth-server-surface/spec.md` (auth boundary), `openspec/specs/observability/spec.md` (metrics on reports endpoint latency — small follow-up to existing observability wiring).
- **Untouched**: `rbac-admin`, `audit-log-ui`, `password-reset-user-flow`, `mail-adapter-port`, `google-oauth-handshake`, `nextauth-web-routes`.

## Test plan

- **Unit (Vitest) RED → GREEN → TRIANGULATE → REFACTOR**:
  - `TimeBucketService` — empty array, single tx, mixed sign, week vs month boundaries (incl. week-end-of-year, leap day), inverted range, exact duplicates.
  - `ReportsService` — orchestration: takes port + FX provider, returns summary/breakdown/period with FX-converted values. Triangulate: empty range, partial month, single category, multi-currency mix.
  - CSV serializer — empty rows, single row, special chars (`=`, `+`, `-`, `@`), CRLF normalization, BOM for Excel compatibility.
- **Integration (Vitest + NestJS Test module)**:
  - `ReportsController` with a mock `ReportsRepository` + real `TimeBucketService` + mock `JwtAuthGuard` injection of `userId`.
  - `GET /api/reports/summary` with auth → 200 + valid response shape.
  - Cross-user leak test: `userId-A` requests a date range; response contains only `userId-A`'s transactions even if the repo is queried with a different `userId` (belt-and-suspenders test).
- **Component (Vitest + Testing Library + happy-dom)**:
  - `ReportsFilterBar` — 5 states: loading / error / success / empty / validation-error.
  - `MonthlySummaryCard` — same 5 states.
  - `CategoryBreakdownTable` — same 5 states.
  - `PeriodComparisonPanel` — same 5 states.
  - `ExportCsvButton` — loading / error / success / disabled-when-empty.
- **BDD (Cucumber 13)**:
  - `reports.feature` covers: monthly summary for a fresh user; category breakdown after 5 transactions in 2 categories; period comparison with delta; CSV export summary mode; CSV export detail mode; CSV injection guard.
- **E2E (Playwright)**:
  - One critical flow per locale: `/en/reports` opens → filter "this month" → see monthly summary → click "export CSV" → file downloads.
  - `/es/reports` mirrors the same flow.
  - WCAG AA audit via `@axe-core/playwright` is covered by `apps/web/e2e/reports.spec.ts` and locked to `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa`.
- **Coverage target**: 60% lines/branches/functions/statements per `openspec/config.yaml`. Per-package on the new `libs/features/reports/{shared,server,client}`.

## Quality gates (must pass before merge)

| Gate | Command | Expected |
| --- | --- | --- |
| Install | `pnpm install` | exits 0 |
| DB | `pnpm db:up && docker compose ps` | Postgres healthy |
| Build | `pnpm turbo run build` | exits 0 |
| Lint | `pnpm turbo run lint` | exits 0 |
| Typecheck | `pnpm turbo run typecheck` | exits 0 |
| Test | `pnpm turbo run test` | exits 0 |
| Boundary fixtures | `pnpm lint:fixtures` | exits 0 |
| BDD | `pnpm turbo run bdd` | exits 0 (all scenarios green) |
| E2E | `pnpm turbo run e2e` | exits 0 (both locales + axe pass) |

## Risks

- **Currency normalization drift** — if user mixes currencies in time range, FX rate staleness could give misleading deltas. **Mitigation**: use the same `FxRateProvider` as transactions; respect its 24h staleness policy; in the report, surface a `fxFreshness` field (e.g., `fresh | stale`) so the UI can show a banner.
- **CSV injection in export** — cells starting with `=`, `+`, `-`, `@` execute formulas in Excel/Sheets. **Mitigation**: prefix `'` for any cell matching `^[=+\-@]`. Add explicit unit test.
- **Performance: aggregations over large date ranges** — a user with 5 years of transactions might time out. **Mitigation**: enforce a max range of 365 days; return 400 Bad Request with a clear message otherwise. Add observability counter on the endpoint.
- **Period comparison arithmetic edge** — DST boundaries + month-length differences could mis-align the comparison window by 1 day. **Mitigation**: comparison window is computed via `(fromDate - duration, fromDate)` where `duration = toDate - fromDate` in days; we explicitly do NOT use "same calendar month last year" to avoid DST drift.

## Migration

None. Read-only slice, no DB changes, no schema changes, no data backfill.

## Open questions (deferred — answered for this proposal)

1. ✅ Date range presets — Presets (Esta semana, Este mes, Últimos 3 meses, YTD) + Custom.
2. ✅ Period comparison — Dual (current vs previous, with delta).
3. ✅ CSV export columns — Dual mode (`?detail=transactions` for line items, default = summary).
4. ✅ Charts — *Dropped from scope per the Recharts amendment in design.md §"Visualization". Numeric `<Stat>` cards are the final UX.*
5. ✅ Empty state — Onboarding CTA → `/transactions/new`.
6. ✅ Default currency — FX-normalize to primary currency; detail keeps per-row `currencyCode`.

## Next phase

`sdd-spec` — write capability spec at `openspec/changes/module-6-reports/specs/reports/spec.md` (EN) + Spanish mirror.
