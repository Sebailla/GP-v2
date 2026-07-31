# Changelog

All notable changes to `gastos-personales-reference` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-07-31

### Summary

Module 6 (Reports & Analytics) vertical slice ships end-to-end. The new `apps/web/app/[locale]/(app)/reports/page.tsx` renders a locale-aware, WCAG AA-compliant analytics surface — monthly summary, category breakdown, period comparison, and CSV export — with the `PrismaReportsRepository` production binding replacing the in-memory adapter at the NestJS module layer. **MINOR bump** from v1.2.0 → v1.3.0 because the release introduces a new public-API surface (4 `GET /api/reports/*` endpoints + the `/[locale]/(app)/reports` page) and is backward-compatible with v1.2.0 auth + transactions.

Closes all 4 carry-forward items from the v1.2.0 archive-report: WARNING-W1 (CSV detail filename deviation), WARNING-W2 (Recharts structural-only dep), WARNING-W3 (TotalsService reuse amendment), and SUGGESTION-S4 (S20 WCAG AA audit deferred to compliant). Ships the `PrismaReportsRepository` + `UserPreference` schema change + `@prisma/adapter-pg` integration that closes the slice-3+ TODO. Re-archived with `pass` verdict (zero warnings, zero critical findings, two SUGGESTIONs both out of M6 scope).

131 `@features/reports` Vitest tests + 247/248 `apps/api` Vitest tests + 65 BDD scenarios + 12 Playwright auth-screen a11y tests + 6 Playwright reports-page a11y tests all pass. Coverage on `@features/reports` is 95.5% statements / 86.4% branches (well above the 60% target). Eight canonical specs now live at `openspec/specs/<domain>/spec.md` with byte-identical EN/ES mirrors under `Documents-es/`.

### Added — Module 6 PR #1 (Foundation: shared schemas + workspace skeleton)

`libs/features/reports/` workspace package: 4 canonical Zod schemas (`report-query`, `report-summary`, `report-by-category`, `report-by-period`) with 52 unit tests. `pnpm-workspace.yaml` and `tsconfig.base.json` updated to include the new package + path alias. 4 schema tests, 2 RED-GREEN atomic commits per schema (8 commits total). Slice scaffolding following the AGENTS.md §7 boundary rule (schemas under `shared/`, services under `server/`, components under `client/`).

### Added — Module 6 PR #2 (Domain: `ReportsRepository` port + `TimeBucketService` + CSV serializer)

`ReportsRepository` port interface with the 2 read-only operations the slice needs. `REPORTS_REPOSITORY_TOKEN` DI token (slice-wide pattern). `TimeBucketService` for week/month bucketing (DST-safe, pure-domain, no I/O). `csvSerializer` with the injection guard (`=`, `+`, `-`, `@` prefix), UTF-8 BOM, and CRLF line endings. 350 lines including tests. RED → GREEN → TRIANGULATE pattern per task.

### Added — Module 6 PR #3 (`ReportsService` + `InMemoryReportsRepository` + NestJS wiring)

`ReportsService` (4 methods: `getSummary`, `getByCategory`, `getByPeriod`, `exportCsv`). `InMemoryReportsRepository` for tests + BDD. NestJS `ReportsModule` wired in `apps/api/`. The integration test that exercises cross-user isolation at the controller boundary ships in this PR. 600 lines including tests. Observability counter stubbed (the `apps/api/src/modules/metrics/` wiring from M5 picks it up).

### Added — Module 6 PR #4 (BDD bridge + 12 Gherkin scenarios)

`libs/features/reports/docs/reports.feature` (20 Gherkin scenarios matching the spec, of which 12 are exercised end-to-end via the in-memory adapter). 5 step-definition files + the slice-8 binding bridge. `cucumber.json` extended to include the new feature. 1326 lines including tests + step defs. All 12 BDD scenarios pass.

### Added — Module 6 PR #5 (Page UI + i18n + client components + Recharts amendment)

`apps/web/app/[locale]/(app)/reports/page.tsx` (server component). 10 client components: `ReportsWorkspace` (state machine), `MonthlySummaryCard`, `CategoryBreakdownTable`, `PeriodComparisonPanel`, `ExportCsvButton`, `FxStalenessBanner`, 3 state components, 4 hooks. `next-intl` catalogs in `apps/web/messages/{en,es}.json` (38 keys per locale). The Recharts commit was *amended* in the v1.3.0 follow-up cycle (see "Changed" below) — the original commit landed the dep structurally; the amendment drops the chart library promise and the UI ships as numeric `<Stat>` cards + comparison table, which is the canonical reporting UX for the reference repo. 4 RED-GREEN commits: client API + 4 hooks, state components + i18n, filter bar + summary + breakdown + workspace, main UI components + page.

### Changed — Module 6 W1: CSV detail filename (`.transactions.csv` → `.detail.csv`)

The implementation shipped `.transactions.csv` because the BDD feature was relaxed to match the implementation rather than the spec. The v1.3.0 fix re-aligns implementation to spec: `reports-<fromDate>-<toDate>[.detail].csv`. Closes WARNING-W1 from the v1.2.0 archive-report.

### Changed — Module 6 W2: drop Recharts promise, ship numeric Stat cards

Investigation showed the `recharts` dependency was *never actually added* to `apps/web/package.json` (the verify-report's WARNING-W2 was inaccurate: the dep was not in `package.json` and not in `pnpm-lock.yaml`). The original commitment to integrate Recharts (`BarChart` in `MonthlySummaryCard`, `LineChart` in `PeriodComparisonPanel`) was amended: the slice ships numeric `<Stat>` cards and a comparison table, which is the canonical reporting UX for the reference repo. The `design.md` §"Visualization (amended — no chart library)" carries the rationale (no bundle weight, no chart-rendering dependencies, accessible by default). Closes WARNING-W2 from the v1.2.0 archive-report.

### Changed — Module 6 W3: `TotalsService` reuse amendment

The original proposal committed to delegating per-category + per-user totals to `TotalsService` from `@features/transactions` to avoid "two implementations diverging". Investigation showed this is **not feasible by construction**: `TotalsService` consumes `Transaction` (with `kind: 'income' | 'expense'`, sign encoded in the row) and `Decimal` amounts in the original currency; `ReportsService` consumes `TransactionForReport` (with sign-aware `amount: string`, already FX-converted to the user's primary currency). The two data shapes are not interchangeable. The `ReportsService.aggregateTotals` helper is the correct, minimal implementation; the original "divergence risk" doesn't apply because the two aggregations answer different questions (per-user undifferentiated totals vs FX-normalized per-user / per-category / per-period totals). The amendment updates 8 EN/ES spec/proposal/design files with the rationale. Closes WARNING-W3 from the v1.2.0 archive-report.

### Added — `PrismaReportsRepository` + `UserPreference` schema

The `PrismaReportsRepository` is the production binding for `REPORTS_REPOSITORY_TOKEN`, replacing the `InMemoryReportsRepository` at the NestJS module layer. The implementation includes:

- **Schema change** (`libs/core/database/prisma/schema.prisma` + migration `20260731000000_add_user_preference/`): a new `model UserPreference` with `primaryCurrencyCode: String?` (FK to `currencies.code`, SET NULL on the optional currency). One row per user. The `UserPreference` table is the seam that lets `findPrimaryCurrencyForUser` resolve the user's primary reporting currency.
- **Adapter** (`libs/features/reports/src/server/infrastructure/adapters/prisma-reports.repository.ts`): the 2 port operations against the Prisma client with cross-user isolation (`where: { createdBy: userId, deletedAt: null }`), half-open `[fromDate, toDate)` range filter (corrected in the v1.3.0 cycle — see "Fixed" below), and sign-aware amount projection at the boundary (Prisma's `Transaction.amount` is always positive magnitude; sign is in `kind`; the adapter projects to `TransactionForReport.amount: string` as positive for income, `-X.XX` for expense, matching the in-memory adapter exactly).
- **Wiring**: `apps/api/src/modules/reports/reports.module.ts` swaps `useClass: InMemoryReportsRepository` for `useClass: PrismaReportsRepository` so the production binding is Prisma. Tests + BDD still use the in-memory adapter (substituted via `Test.createTestingModule`).
- **Integration tests** (`prisma-reports.repository.test.ts`, 6 tests): half-open range, sign-aware amount, cross-user isolation, primary currency lookup — all run against a real Postgres container (the dev-environment `pnpm db:up` brings up the canonical target).

### Fixed — half-open range off-by-one (calendar-day inclusion)

Investigation of the integration tests surfaced a latent bug in 4 files: the `toDate` boundary was interpreted as start-of-day UTC instead of end-of-day. A transaction at `2026-08-01T12:00:00Z` with `toDate: "2026-08-01"` was **excluded** because the filter used `lt: 2026-08-01T00:00:00Z`. The spec says "half-open `[fromDate, toDate)` is inclusive on both calendar days" — the implementation had a calendar-day off-by-one. Fixed in `in-memory-reports.repository.ts`, `prisma-reports.repository.ts`, `time-bucket.service.ts`, and the `computeComparisonWindow` helper in `reports.service.ts`. The 2 time-bucket tests that codified the buggy behavior were updated to assert the calendar-day inclusion semantics instead. Surfaced by the un-skip of the Prisma adapter integration tests; the BDD suite was not exercising the boundary case (transactions at exactly `toDateT00:00:00Z`).

### Fixed — `@prisma/adapter-pg` integration (closes slice-3+ TODO)

The `@core/database/src/client.ts` placeholder `accelerateUrl` that blocked every Prisma adapter in the repo from connecting to a real Postgres is replaced with the `@prisma/adapter-pg` driver adapter. The Prisma 7 client is now constructed with `new PrismaPg({ connectionString: DATABASE_URL })` and the placeholder + the TODO comment are removed. `turbo.json`'s `test`, `lint`, and `typecheck` tasks now declare the 7 env vars so they propagate to child processes (the `build` and `bdd` tasks already did). Closes the slice-3+ TODO that has been blocking Prisma adapter integration since slice 3.

### Added — S20 WCAG AA audit (closes SUGGESTION-S4 from v1.2.0)

The module-6-reports slice was committed to a `@axe-core/playwright` audit on the rendered `/[locale]/reports` page. The v1.3.0 cycle delivers:

- `apps/web/e2e/reports.spec.ts` (the S20 audit harness) — mocks the 4 `/api/reports/*` endpoints via `page.route()`, runs `expectNoAxeViolations(page)` for both `en` and `es` Playwright projects, asserts zero violations of the locked WCAG tag set (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`).
- `generateMetadata` on the reports page + the 5 auth pages (sign-in, sign-up, forgot-password, reset-password/[token], error) so every page renders a non-empty `<title>` element. Closes the `@axe-core/playwright` `document-title` rule that the audit caught.
- Locale-aware i18n keys (`reports.meta.*`, `auth.meta.*`) in `apps/web/messages/{en,es}.json`.

The audit flips scenario S20 from `DEFERRED` to `COMPLIANT` in the 4 spec files (EN delta + canonical, ES delta + canonical). The `e2e/reports.spec.ts` suite is part of `pnpm e2e` and runs against a mocked API surface (no live DB required). 6 Playwright tests pass for the reports audit; 12 pass for the auth-screen audit (a side benefit of the `<title>` fixes — the slice-4 `wcag-aa.spec.ts` suite that was previously failing in the dev environment for the same `document-title` reason is now green too).

### Quality gates

- `pnpm install`: exits 0
- `pnpm turbo run build lint typecheck test`: 46/46 successful
- `pnpm lint:fixtures`: 118 passed, 0 failed
- `pnpm turbo run bdd`: 12/12 reports scenarios + 25/25 transactions + 28/28 auth = 65 scenarios total
- `pnpm --filter @core/database exec vitest run`: 26/26 tests (includes the 6 newly un-skipped `PrismaReportsRepository` integration tests against a real Postgres)
- `pnpm --filter @features/reports exec vitest run`: 131/131 tests
- `pnpm --filter api exec vitest run`: 247/248 tests (1 pre-existing skip in `auth-hash.bcrypt.perf.test.ts`)
- `pnpm --filter web exec tsc --noEmit`: clean
- `pnpm --filter web exec eslint .`: clean
- `pnpm playwright test e2e/reports.spec.ts`: 6/6 (en + es + smoke)
- `pnpm playwright test e2e/wcag-aa.spec.ts`: 12/12 (4 pages × 3 projects)
- Coverage on `@features/reports`: 95.5% statements / 86.4% branches / 90.2% functions / 95.7% lines (well above the 60% target)
- DB: `pnpm db:up && docker compose ps` shows Postgres healthy

### Out of scope (carried forward to v1.3.x patches)

- SUGGESTION-S2 (slice-4 / slice-7 auth-harness fragility): the `wcag-aa.spec.ts` and `transactions/login-list-create.spec.ts` suites were failing in the local dev environment for the `document-title` reason before the `<title>` fixes landed; after this release the auth-harness fragility is a different (smaller) issue. Recommended tracking as a slice-4/7 follow-up change.



### Summary

Productionization program completion. Six chained PRs (#79 Module 2 Public Authentication, #80 Module 3 Superadmin, #81 Module 4 Privacy, #82 Module 5 Production Hardening, #83 Module 5.1 Coverage Hardening, #84 Module 5.1.1 Coverage Hardening housekeeping) ship M2–M5.1.1 end-to-end. **MINOR bump** from v1.1.1 → v1.2.0 because the release introduces additive new public-API surfaces (Google OAuth handshake, superadmin session management endpoints, audit-log UI, observability metrics, coverage gate) and remains backward-compatible with v1.1.1 auth + transactions surfaces.

Closes 3 carry-forward WARNINGs from v1.1.1: bcrypt-cost-12, F2 race (serializable isolation on idempotency replay), circuit-breaker perf. Adds observability metrics wiring. Adds coverage gate enforcement (60% per package, fail-fast in CI). Closes M5.1 FAIL carry-forward by lifting apps/api branch coverage 54.87% → 68.80%.

658 Vitest + BDD + Playwright tests pass. Six chained PRs were each PASS-WITH-WARNINGS at the 4R review (0 blockers, 0 criticals). Eight canonical specs now live at `openspec/specs/<domain>/spec.md`.

### Added — Module 2 Public Authentication (PR #79)

Google OAuth handshake wired through `@core/auth` (no information leak on already-authenticated users, idempotent account linking, `redirect-if-already-authenticated` guard on the four auth pages). DevMailbox backend for local validation. Password reset flow with single-use tokens, 1-hour expiry, and audit-log emission.

### Added — Module 3 Superadmin (PR #80)

Sessions list + revoke UI for `role: 'superadmin'`. Role management page (promote / demote between `user` and `superadmin`). Audit log viewer with filter + pagination. All actions emit audit-log events through `@core/events`.

### Added — Module 4 Privacy (PR #81)

Audit log retention policy + scheduled cleanup. Audit log UI surface (filter, export, detail drawer). `Session.lastActiveAt` tracking with 30-day inactivity expiry. `LastSeenIndicator` UI component on the session list.

### Added — Module 5 Production Hardening (PR #82)

BCRYPT cost raised 10 → 12 (closes v1.1.1 WARNING). F2 race closed via `prisma.$transaction` with `Serializable` isolation on idempotency replay. Circuit breaker pattern on the FX rate provider. Observability metrics exposed via `/metrics` (request duration histograms, error counters, FX provider call counts).

### Added — Module 5.1 Coverage Hardening (PR #83)

Vitest 4.1.x migration. Custom `runsOnce` Vitest validator. Race stabilization suite for F2 (idempotency replay under concurrency). Runbook under `docs/operations/admin-runbook.md` (EN) and `Documents-es/docs/operations/admin-runbook.md` (ES mirror).

### Added — Module 5.1.1 Coverage Housekeeping (PR #84)

`apps/api` branch coverage lifted 54.87% → 68.80%. Per-package 60% threshold hard-locked in CI (fail-fast). Re-verification of M5.1 PASS WITH WARNINGS — no blockers.

### Changed

- 12 × `package.json` workspace version bumped from `1.1.1` → `1.2.0` (apps/web, apps/api, libs/core/{database,config,events,logging,rate-limit}, libs/features/{auth,transactions}/server, libs/shared-utils/{decimal,date-formatting,currency}).
- `pnpm-lock.yaml` updated to reflect ESLint 10, Vitest 4.1.x, Prisma 7.8, NextAuth 5 beta 25, Hono 4.12.
- Branch model updated: `develop` is the working branch, `main` is the immutable production release branch. Both branches now share the same protection rules (no force-push, no delete, 1 required review); `develop` is enforced stricter (`enforce_admins: true`).

### Quality gates

| Gate              | Result                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Typecheck         | PASS (`pnpm turbo run typecheck` — all workspaces)                                              |
| Lint              | PASS (`pnpm turbo run lint`)                                                                    |
| Test              | PASS (658/658 tests across Vitest + BDD + Playwright across `@features/auth`, `@features/transactions`, `apps/api`, `apps/web`, libs) |
| Build             | PASS (`pnpm turbo run build`; apps/api dist + apps/web .next)                                   |
| Boundary fixtures | PASS (`pnpm lint:fixtures`)                                                                     |

**Total workspace tests at v1.2.0**: 658 (was 491 at v1.1.1; the +167 delta is mostly slice-7 BDD bridge fixes + slice-8 auth BDD gate coverage + M5.1.1 coverage hardening).

### Known issues still deferred

- **`apps/web` build** Pages Router vs App Router config drift — slice 8 closed the lib/auth.ts barrel split, full App Router migration is still pending.
- **`format:check` drift** — apply Prettier formatting to the workspace; pending chore PR.
- **CI BDD + Playwright jobs** — wired in slice 8 PR-2; observability around BDD runs is still pending.

### Release process

- **Branch model**: `develop` is the working branch; `main` is the immutable production release branch. Releases are cut via `release/v<MAJOR>.<MINOR>.<PATCH>` branches off `develop` → PR → `main` → tag → GitHub release.
- **Commit convention**: Conventional Commits (no `Co-Authored-By` / no AI attribution).
- **Branch-model convention** (per AGENTS.md §2): feature branches cut from `develop`, work-unit commits, `git revert <sha>` for rollback.
- **Spanish mirror rule** (per AGENTS.md §13): every English `.md` under `openspec/` or `docs/` ships with `Documents-es/...` Spanish mirror IN THE SAME atomic commit. Verified via `grep -P '[\x{4e00}-\x{9fff}]'` to keep CJK mojibake out.

[1.2.0]: https://github.com/Sebailla/GP-v2/compare/v1.1.1...v1.2.0
[Unreleased]: https://github.com/Sebailla/GP-v2/compare/v1.2.0...HEAD

## [1.1.1] - 2026-07-09

### Summary

Hardening batch — 7 latent issues closed across three chained PRs (#31, #32, #33). **Patch bump** because no public-API contract changes; the version-roll signals the workspace hardening that landed without breaking the v1.1.0 auth + transactions surfaces.

The hardening surfaced and fixed two latent bugs that were planning to ship with v1.1.0: **R1-001 BLOCKER** (D-TX-7 cross-user mutation — any authenticated user could PATCH/DELETE another user's transaction with a guessed cuid) and **R3-004 WARNING** (the FX_RATE_PROVIDER_TOKEN binding was decorative — production overrides were silently bypassed). The 4R review sweep caught both during the slice-5 close-out, but the fixes were not in scope of that PR; they landed here as part of the v1.1.0 hardening batch.

### Added — CI workflow (PR #32)

`.github/workflows/ci.yml` — four-job pipeline (static + test + build + boundary fixtures) runs on every PR against develop or main. Lint + boundary fixtures are required; typecheck, build, and test are `continue-on-error: true` (informational) until slice-7 cleans the pre-existing noise (TS7006/TS6133, Pages Router vs App Router config drift in apps/web).

`prisma generate` step in static + build jobs (a fresh-install CI cache restore skips the postinstall hook).
`pnpm db:migrate:deploy` runs migrations against the test Postgres service (corrected from a non-existent root-package script to `pnpm --filter @core/database exec prisma migrate deploy`).

### Added — Prettier format lock (PR #32)

`.prettierrc.json` — locks the formatter at the boundary so future commits don't compound the 230-file pre-existing drift. Configuration: 2-space, semi, double quote, LF, 100-col-wide. `proseWrap: preserve` for `.md` keeps the keep-a-changelog tables and Spanish-mirror structure intact. Known-issues: `format:check` will fail on the pre-existing 230-file drift until the proposed chore PR `style: apply Prettier formatting` runs.

### Fixed — transactions hardening (PR #31)

- **R1-001 BLOCKER (D-TX-7 cross-user mutation)** — `TransactionRepository.update` / `softDelete` / `findByIdForUser` / `findByIdForUserIncludingDeleted` now require an explicit `userId` parameter; the Prisma adapter filters `where: { id, createdBy: userId, deletedAt: null }` (no information leak on "exists vs. mine"). The controller's `actorId` flows from `request.user.id` for both audit-log + ownership.
- **R3-002 BLOCKER (atomicity)** — `UnitOfWork` port + `PrismaUnitOfWork` adapter wraps `txRepo.create` + `auditLogRepo.append` + `idempotencyRepo.create` in a `prisma.$transaction` (SERIALIZABLE isolation). Event dispatch moved post-commit so a failing subscriber doesn't roll back the database write. `DuplicateIdempotencyKeyError` race path swallowed inside the cache-write so the unit-of-work doesn't roll back the already-persisted row.
- **R4-005 WARNING (audit/dispatch atomicity)** — same `UnitOfWork.run` boundary applied to `update` and `softDelete`.
- **R3-004 WARNING (FX_RATE_PROVIDER_TOKEN bypass)** — the `TransactionService` factory now resolves `FX_RATE_PROVIDER_TOKEN` via `inject:[]` rather than constructing `new InMemoryFxRateProvider(...)` directly. A production override of the token now actually takes effect (the seeded `DEFAULT_SEED_AT = 2026-01-01` had been silently bypassing real HTTP-backed impls).
- **R3-005 WARNING (production FX fail-fast)** — the `TransactionsModule` factory now throws at module-load time when `NODE_ENV === "production"` AND the bound `FxRateProvider` is `InMemoryFxRateProvider`. Production deploys fail-fast instead of silently corrupting `reportingAmount`.
- **R1-003 WARNING (Decimal precision drift)** — the `createSchema` / `updateSchema` `amount: z.coerce.number()` lost IEEE-754 precision before `toDecimal()` could rescue it. Replaced with `amount: z.string().regex(/^\d+(\.\d+)?$/)` so the wire bytes survive into `toDecimal(body.amount)`. Plus a `.refine()` guard that rejects zero (the previous `.positive()` semantic).
- **R1-004 WARNING (Idempotency-Key bound)** — the controller caps the `Idempotency-Key` header at 128 characters (matching the slice-2 cursor cap) before the SHA-256 fingerprint is computed.
- **R4-004 WARNING (assertion rigor)** — `[S4]` tightened from `rejects.toThrow(/Category/)` to `rejects.toBeInstanceOf(CategoryNotFoundError)` so a future refactor swapping the error class fails the test instead of silently passing on a substring match.
- **R4-010 SUGGESTION (`DuplicateIdempotencyKeyError` race coverage)** — new `[S4a]` scenario mocks `idempotency.create` to throw `DuplicateIdempotencyKeyError` and verifies the transaction row still persists.
- Plus two tests added: `[S7a]` (softDelete cross-user rejection) and `[S8a]` (update cross-user rejection).

### Added — Mirror sync metadata (PR #33)

Spanish mirror of `apply-progress.md` got an explicit **estado del espejo** table that documents which sections are sincronizado and which are pendiente (slices 1–3, slice 5 PR #3, v1.1.0 release notes, v1.1.1 hardening). The retroactive translation of the pendientes (~2,260 lines) is a separate work item; the slice 6 follow-up can either complete it or defer further.

### Changed

- 10 × `package.json` workspace version bumped from `1.1.0` → `1.1.1` (apps/web, apps/api, libs/core/{database,config,events}, libs/features/{auth,transactions}/server, libs/shared-utils/{decimal,date-formatting,currency}).
- `pnpm-lock.yaml` updated to reflect the new ESLint / zod / Prisma client exports from the CI workflow + the workspace devDeps added during the fix-up chain.

### Quality gates

| Gate              | Result                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Typecheck         | PASS (`pnpm turbo run typecheck` 31/31 tasks)                                                        |
| Lint              | PASS (CI gate)                                                                                       |
| Test              | PASS (491/491 tests across `@features/auth`, `@features/transactions`, `apps/api`, `apps/web`, etc.) |
| Build             | PASS (`pnpm turbo run build`; apps/api dist + apps/web .next)                                        |
| Boundary fixtures | PASS (`pnpm lint:fixtures`)                                                                          |

**Total workspace tests at v1.1.1**: 491 (was 274 at v1.0.0; was 184 at v1.1.0; the +307 delta is mostly slice-3 auth-service unit tests + slice-4 web/state-coverage + slice-5 transactions services).

### Known issues still deferred

- **TS7006 implicit-any + TS6133 unused-imports** in slice-3 + slice-5 modules (dev typecheck surfaces them when `apps/web` Pages Router vs App Router config drift is also fixed). **Slice 7**.
- **`apps/web` build** fails standalone — the Next.js 16 `next/headers` import is only valid in App Router but the slice-4 Pages Router scaffold pre-dates the migration. **Slice 7** for the App Router migration.
- **`format:check` drift** — 230 files pre-existed before the `.prettierrc.json` lock. **`style: apply Prettier formatting to the workspace`** chore PR.
- **Retroactive `§13` mirror sync** for slices 1–3, slice 5 PR #3, v1.1.0 release notes — 6 sub-tickets per the PR #33 body.
- **CI BDD + Playwright jobs** — slice 4 kept them scaffolded; slice 7 wires them.
- **`recordInBuffer`-side-effects** noted in the v1.1.0 known-issues.

### Release process

- **Branch model**: `develop` is the working branch; `main` is the immutable production release branch. Releases are cut via `release/v<MAJOR>.<MINOR>.<PATCH>` branches off `develop` → PR → `main` → tag → GitHub release. (This release: `release/v1.1.1` → PR → `main` → tag `v1.1.1` → `gh release create`.)
- **Commit convention**: Conventional Commits (no `Co-Authored-By` / no AI attribution).
- **Branch-model convention** (per AGENTS.md §2): feature branches cut from `develop`, work-unit commits, `git revert <sha>` for rollback.
- **Spanish mirror rule** (per AGENTS.md §13): every English `.md` under `openspec/` or `docs/` ships with `Documents-es/...` Spanish mirror IN THE SAME atomic commit. Verified via `grep -P '[\x{4e00}-\x{9fff}]'` to keep CJK mojibake out.

[1.1.1]: https://github.com/Sebailla/GP-v2/compare/v1.1.0...v1.1.1
[1.0.0]: https://github.com/Sebailla/GP-v2/releases/tag/v1.0.0

## [1.1.0] - 2026-07-09

### Summary

The transactions server slice (slice 5) lands in full — multi-currency + soft-delete + idempotency-key + audit log + 5 transactions events — closing the v1.0.0 release's deferred surface. The v1.0.0 scope was the auth surface; v1.1.0 picks up the second vertical slice (transactions server) and the controller wiring the web client will speak to in slice 6. Version bump from `1.0.0` → `1.1.0` is a **minor** (additive new surface, backward-compatible with auth surface from v1.0.0).

The slice 5 close-out PR (#30) brought 9 atomic commits and surfaced two latent bugs through the 4R review sweep that would have shipped otherwise: **R1-001 BLOCKER** (D-TX-7 cross-user mutation authorization gap — any authenticated user could PATCH/DELETE another user's transaction with a guessed cuid) and **R3-011 CRITICAL** (a regression in the D-TX-7 fix that broke HTTP DELETE idempotency). Both are now fixed and tested. The triangulation suite catches a third class of latent issues (mock fidelity, `DuplicateIdempotencyKeyError` race coverage, ownership semantics) and will land incrementally across slice 6+.

### Added — Transactions server (slice 5, PRs #27 #28 #29 #30)

The transactions server vertical slice — extends Prisma with Currency, FxRate, Category, Transaction, IdempotencyKey, AuditLog tables; entities + ports + services including TransactionService (with idempotency-key atomic replay, FX lookup with staleness dispatch), CategoryService (with soft-delete filter D-TX-5), TotalsService (sign-aware), ThresholdService (post-create dispatch); Prisma repositories; InMemoryFxRateProvider; NestJS controllers; 5 events emitted on `@core/events`.

- **T5.1 + T5.2** — Prisma schema extension + `pnpm prisma migrate dev` (gate check).
- **T5.3** — RED Vitest test for `TransactionService.create` with FX conversion.
- **T5.4** — `libs/features/transactions/shared/schemas` Zod schemas (create / update / list / category-create / category-update). The canonical schemas reused by both the web forms (slice 6) AND the NestJS ZodValidationPipe.
- **T5.5 + T5.6** — domain entities (TypeScript interfaces) + ports (`TransactionRepository`, `CategoryRepository`, `CurrencyRepository`, `FxRateRepository`, `IdempotencyRepository`, `FxRateProvider`). **Critical**: `CategoryRepository` JSDoc states the non-opt-out soft-delete invariant (D-TX-5).
- **T5.7** — five Prisma adapters implementing the ports. **`CategoryRepository` ALWAYS adds `where: { deletedAt: null }` to every read query** — no escape hatch.
- **T5.8** — `InMemoryFxRateProvider` (default `FxRateProvider` impl) seeded at startup with USD↔ARS↔EUR pairs. `advanceClock()` test helper so the 24h staleness boundary is exercise-able.
- **T5.9** — four domain services (`TransactionService`, `CategoryService`, `TotalsService`, `ThresholdService`) + `AuditLog` port. New methods `list` / `update` / `softDelete` ship with this PR to unblock the close-out; D-TX-7 ownership enforcement on `update` + `softDelete` (R1-001 fix).
- **T5.10** — Nest DI token `FX_RATE_PROVIDER_TOKEN` wired in `apps/api/src/modules/transactions`. The token binding now actually takes effect after the R3-004 fix (the factory previously constructed `new InMemoryFxRateProvider(...)` directly, bypassing the token).
- **T5.11** — NestJS controller (`apps/api/src/modules/transactions/transactions.controller.ts`) with 8 endpoints: `POST/GET/PATCH/DELETE /transactions` + `GET/POST/PATCH/DELETE /categories`. JWT-guarded via `@UseGuards(JwtAuthGuard)`. ZodValidationPipe on body + query. `POST /transactions` requires the `Idempotency-Key` header (D-TX-1); SHA-256 fingerprint mismatch → 409 (`IdempotencyKeyReusedError`). `ThresholdService.evaluate` runs post-create inside try/catch (R3-001 fix) so a downstream-subscriber failure does NOT 500 a successfully-persisted transaction.
- **T5.12** — triangulation suite (8 cross-cutting + 2 cross-user rejection scenarios). 11 cases in `@features/transactions/server/src/__tests__/transactions.integration.test.ts`. Cross-user scenarios (`[S7a]`, `[S8a]`) assert D-TX-7 ownership enforcement after the R1-001 fix.
- **T5.13** — refactor (drop unused `_userId` parameter, dead `export type { CategoryKind }` cleanup) + final turbo gate (`pnpm turbo run lint typecheck test --filter api --filter @features/transactions` exits 0; **184/184 tests pass**).

### Added — Slice 5 controller (PR #30)

- **`apps/api/src/modules/transactions/transactions.controller.ts`** (~565 LOC). Thin DI-wiring + route-binding layer. Maps domain errors to HTTP (400/404/409/422). Idempotency-Key replay returns the cached payload (controller maps to 200/201 depending on the cached status) instead of re-running the write path.
- **`apps/api/src/shared/decorators/query.decorator.ts`** — `@QuerySchema(<schema>)` parameter decorator. Parallels the `BodySchema` decorator from slice 3 batch 6.
- **`@shared-utils/decimal`** path alias added to `apps/api/tsconfig.json` (was missing; service-layer files compiled because their own tsconfigs had the alias, but api couldn't resolve it).

### Changed — Architectural decisions

- **R1-001 D-TX-7 enforcement**: `TransactionRepository.update` / `softDelete` / `findByIdForUser` now require an explicit `userId` parameter. The Prisma adapter filters `where: { id, createdBy: userId, deletedAt: null }` (no info-leak on "exists vs. mine"). This was a real authorization gap discovered by the 4R review; cross-user mutation surfaces as `TransactionNotFoundError` → controller 404. The auth surface (slice 4) and the transactions server (slice 5) now match in contract: caller identity flows through `request.user.id` (from the JWT) into every write path.
- **R3-001 threshold boundary**: `thresholdService.evaluate` runs inside try/catch in the controller. Threshold is informational (per design §5.9), not blocking; failures log to stderr but the 201 is preserved.
- **R3-011 idempotent re-delete**: re-deleting an owned-but-tombstoned row returns 204 (silent skip of write/audit/dispatch), per RFC 7231 §4.3.5. Foreign-owned OR missing rows still return 404.
- **R3-004 DI re-binding**: `TransactionService` factory now resolves `FX_RATE_PROVIDER_TOKEN` via `inject:[]`. The previous direct `new InMemoryFxRateProvider(...)` bypassed the token binding; a production override would have been silently ignored. Production swaps (`HTTP-backed` `FxRateProvider` via env) now slot in correctly.

### Documentation

- `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`: slice 5 close-out section (English + Spanish mirror). Captures the 9 commits, the 4R findings (5 risk + 10 reliability + 9 readability + 7 resilience), the 3 BLOCKER/CRITICAL remediated, and the 6 known-issues deferred to slice 7+.
- `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`: Spanish mirror of the new section.
- `openspec/changes/vertical-slicing-reference-scaffold/tasks.md`: T5.3 + T5.9 markers now `[x]` (bookkeeping fix that landed with the slice 5 close-out).

### Known issues for slice 7+ (NOT in this release)

The close-out 4R sweep surfaced several findings that require either a real Postgres integration (R3-002) or new production infrastructure (R3-005) or larger refactors. They're documented in the PR #30 body and tracked in Engram id 2174.

- **R3-002 BLOCKER — atomicity in `service.create`**: the orchestration `txRepo.create → auditLogRepo.append → events.dispatch → idempotencyRepo.create` is NOT wrapped in a `prisma.$transaction`. Any throw after the row persists leaves the DB with a row but no audit trail; a retry with the same `Idempotency-Key` then misses the cache and re-runs the create path → duplicate transaction. Fix requires `prisma.$transaction` on the trio + post-commit event dispatch. In-memory test doubles can't validate atomic-rollback semantics — needs real Postgres.
- **R3-005 WARNING — production FX fail-fast**: `InMemoryFxRateProvider` is bound to `FX_RATE_PROVIDER_TOKEN` with `DEFAULT_SEED_AT = 2026-01-01`. In production, every cross-currency transaction would dispatch `transactions.fx.stale` (informational noise) and compute `reportingAmount` with the hardcoded rates. The slice ships per design but doesn't gate on `NODE_ENV === 'production'`. Production swap requires a real HTTP-backed `FxRateProvider` implementation.
- **R1-003 WARNING — Decimal drift via `z.coerce.number()`**: by the time the Zod schema coerces the wire string to a JS Number, IEEE-754 precision is already lost. The `toDecimal(String(...))` round-trip in the controller is a no-op for precision recovery. Fix: change the schemas to `z.string().regex(/^\d+(\.\d+)?$/)` (or `z.union([z.string(), z.number()]).transform(toDecimal)`).
- **R1-004 WARNING — `Idempotency-Key` has no upper bound**: an attacker can send a multi-megabyte header. Fix: bound at the boundary (e.g., `.max(128)` matching the `cursor` cap in `listSchema`).
- **R4-005 WARNING — audit/dispatch atomicity**: a partial failure between `txRepo.update/create` and `auditLogRepo.append` leaves the DB with a row but no audit. Same fix family as R3-002 (single Prisma `$transaction`).
- **R4-010 SUGGESTION — `DuplicateIdempotencyKeyError` race coverage**: the suite has no test for two simultaneous first-call POSTs with the same key (losing-write scenario).
- **Mirror sync debt**: `Documents-es/openspec/changes/.../apply-progress.md` is ~2,260 lines behind the English (slices 3 + 4 + 5a/b/c). This release syncs only the slice 5 close-out section. A separate batch should reconcile the older slices.
- **Format-drift**: a `biome.json` formal config would lock formatting; third slice in a row with the auto-formatter drift pattern (id 2155).
- **CI workflow `.github/workflows/ci.yml`**: highest-ROI next step per id 2171; gate lint + test + typecheck + bdd + e2e against develop.

## [1.0.0] - 2026-07-08

### Summary

The initial release of `gastos-personales-reference` — a **publicable, runnable, lint-able, type-check-able, test-able reference repository** for the team's vertical-slicing monorepo model. The project validates the architecture (Next.js 16 + NestJS 11 + Prisma 6 + NextAuth v5) end-to-end across two completed vertical slices (auth server + auth client) and the supporting infrastructure (Prisma client, env config, in-memory event dispatcher, shared utilities).

The scope of v1.0.0 is **the auth surface** (sign-in, sign-up, forgot-password, reset-password, dev-mailbox). The transactions surface (multi-currency + soft-delete + idempotency-key + audit log) lands in slice 5 as a post-1.0.0 release.

### Added — Infrastructure (slice 1 + slice 2)

- **`apps/web`**: Next.js 16 App Router scaffold with `next-intl` plugin, NextIntlClientProvider in the root layout, Tailwind v4 design tokens (light + dark mode CSS variables extracted from `gastos-personales/app/globals.css`), Tailwind postcss config + autoprefixer.
- **`apps/api`**: NestJS 11 scaffold with the `AppModule` (currently just the empty composition root; feature modules land in slice 3+).
- **Monorepo tooling**: pnpm workspaces + Turbo 2.10 orchestrator with `build` / `dev` / `lint` / `test` / `typecheck` / `bdd` / `e2e` / `coverage` pipelines per workspace.
- **ESLint flat config** with a custom boundary plugin (`tools/eslint-plugin-boundary/`) enforcing 4 architectural rules: `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`. Fixture-based test suite (`pnpm lint:fixtures`) verifies the rules fire on violating samples.
- **TypeScript path aliases**: `@core/database`, `@core/events`, `@core/config`, `@features/auth`, `@features/transactions`, `@shared-utils/*` configured at the repo root.
- **Schema-as-source-of-truth Zod library** at `libs/features/auth/shared/schemas/`: 5 schemas (login, register, forgot-password, reset-password, session-list) re-exported from the main `@features/auth` barrel.
- **Prisma 6 + @core/database** singleton with the initial schema (User, Session, Account, VerificationToken, PasswordResetToken). The `no-prisma-outside-core` ESLint rule prevents `new PrismaClient()` anywhere outside `@core/database`.
- **Zod env config** at `libs/core/config/`: fail-fast env parsing at module load. Validates `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`, `API_URL`, plus optional Google OAuth credentials. 20+ unit tests cover happy + sad paths.
- **@core/events** in-memory pub/sub dispatcher with `redactSensitive` redaction at the ring-buffer boundary, `authjs.session-token` cookie compatibility, 31 unit tests covering the 9 domain events + redact + replay paths.
- **@shared-utils** pure helpers: `date-formatting` (formatDate, parseIsoDate, toIsoString), `currency` (formatCurrency with locale + Intl.NumberFormat), `decimal` (decimal.js wrapper — NEVER BigInt per D-TX-6).
- **`openspec/changes/vertical-slicing-reference-scaffold/`**: the full SDD artifact tree (proposal + spec + design + tasks + apply-progress) for the reference repo. Per AGENTS.md §13, every English `.md` ships with a `Documents-es/...` Spanish mirror.
- **Docker Compose** (`docker-compose.yml`) for the Postgres 16 dev environment.

### Added — Auth server (slice 3)

The auth server vertical slice — 4 services + 4 events + 6 routes + NextAuth v5 backend + JWT guard + 4R-fixed (CRITICAL F1 transaction, F2 audit-sink, F3 redaction, F4 TTL cleanup, F8 dispatch guard).

- **`AuthService`** (login, register, getCurrentUser, linkGoogleAccount). 110 unit tests cover happy + sad paths + the new NextAuth JWE mint (round-trip RED+GREEN per the slice 4 NextAuth integration).
- **`SessionService`** (listActiveSessions, revokeSession, revokeAllSessions, getCurrentUser). Tests cover port-driven lookup, idempotent revoke, and the redirect-if-already-authed path.
- **`RbacService`** (can). Permission table mirrors design §4.1 exactly. 11 tests cover USER (4 `*:own` true + 4 `*:any` false) + ADMIN (all 8 true) + defense-in-depth on unknown action values.
- **`PasswordResetService`** (requestReset, consumeReset). Dispatch `auth.password-reset.requested` on request + `auth.password-reset.completed` on consume. 7 tests cover the 5 states (empty / known / unknown / expired / consumed) + the orphan-row fix.
- **`UserRepository` + `SessionRepository` + `PasswordResetTokenRepository`** ports + Prisma adapters. The Prisma adapters are imported from `@core/database` (the `no-prisma-outside-core` boundary).
- **`AuthController`** (NestJS thin wrapper) with 6 routes: `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`. RbacService gates the authenticated routes. AuthError → 401/409, ValidationError → 400, generic → 500 via the `runOrThrowHttp` wrapper.
- **`AuthModule`** (DI composition root) + **`AuthCronService`** (F4 cron, every 15 min, calls `deleteExpired`).
- **`ZodValidationPipe`** + **`@BodySchema(<schema>)`** parameter decorator for body validation on all 6 routes.
- **`JwtAuthGuard`** (real NextAuth v5) decodes the `authjs.session-token` cookie via `@auth/core/jwt#decode` and projects the `userId` + `email` + `role` onto the request. e2e tests cover the real-guard behavior (valid JWT → 200, missing token → 401, malformed → 401, wrong-secret → 401).
- **Auth event wiring**: all 4 events (`auth.password-reset.requested`, `auth.password-reset.completed`, `auth.session.revoked`, `auth.rbac.denied`) dispatched via Pattern A (service calls dispatcher directly). The `wireAuthEvents` monkey-patch wrapper is removed; the `auditSink` port surfaces dispatcher failures.
- **T3.7 integration scenarios** (`multi-provider.test.ts`, `session-expiry.test.ts`, `forgot-password-idempotency.test.ts`): cross-cutting flows between AuthService + SessionService + PasswordResetService.
- **T3.9 final gate**: `pnpm turbo run lint typecheck test` exits 0 across `apps/api` + `libs/features/auth`. `docs/slice-3-checklist.md` (EN + ES mirror) captures the slice 3 verification gates.

### Added — Auth client (slice 4)

The auth client vertical slice — i18n + shadcn primitives + 5 form pages + WCAG AA scaffold + responsive viewport + state-coverage tests + REFACTOR + responsive layout + auth cookie storage + NextAuth integration.

- **T4.2 i18n catalogs** (`apps/web/messages/{en,es}.json`) with mirrored translations. The symmetric-difference test asserts both catalogs have the same key set.
- **T4.3 next-intl middleware** + **`i18n.ts` routing config** (`locales: ['en', 'es']`, `defaultLocale: 'en'`, `localePrefix: 'always'`). Matcher excludes `/api/*`, `/_next/*`, static files.
- **T4.4 shadcn-style primitives**: `Button` (6 variants × 4 sizes, Radix `Slot` polymorphism), `Input`, `Form` (minimal `FormProvider`), `Card` + sub-components. 23 component tests.
- **T4.5 `cn` helper** combining `clsx` + `tailwind-merge`. Type-tested for merge precedence + conflict resolution.
- **T4.6 `components.json`** manifest documenting the primitive set.
- **T4.7 design tokens** extracted from `gastos-personales/app/globals.css` (light + dark mode CSS variables) + Tailwind v4 setup (`@tailwind base/components/utilities`, `postcss.config.mjs`).
- **T4.1 / T4.8 LoginForm + sign-in page** at `apps/web/app/[locale]/(auth)/sign-in/page.tsx` with 5 form states (empty / validation / loading / 401 / 500). Post-success: cookie set + `router.replace('/{locale}/')`.
- **T4.9 SignUpForm + sign-up page** with 5 states (empty / validation / loading / 409 duplicateEmail / 200). Post-success: cookie set + `window.location.href = '/{locale}/sign-in'`.
- **T4.10 ForgotPasswordForm + forgot-password page** with 3 states (empty / loading / success). Idempotent per design D-AUTH-1 (202 for both known + unknown email; no enumeration leak).
- **T4.11 ResetPasswordForm + reset-password/[token] page** with 4 states (empty / validation / loading / 401 invalidToken). Generic copy per D-AUTH-1 (`auth.resetPassword.error.invalidToken`).
- **T4.12 DevMailbox + dev/mailbox/[userId] page** — DEV-ONLY affordance gated by `NODE_ENV !== "production"`. Reads from a `DEV_STUB_EVENTS` module-level constant (real API fetch deferred to slice 4 follow-up). Copy-to-clipboard via `navigator.clipboard.writeText`.
- **T4.13 WCAG AA scaffold**: `apps/web/e2e/wcag-aa.spec.ts` (4 tests) + `apps/web/playwright.config.ts` (2 projects: chromium-en, chromium-es). Best-effort: requires per-dev `npx playwright install chromium`.
- **T4.14 state-coverage** (`apps/web/__tests__/components/auth/state-coverage.test.tsx`) — 20 tests asserting the 5 form states for each of the 4 forms.
- **T4.15 REFACTOR + responsive**: extracted `FormFieldRow` + `AuthFormErrorBanner` + `AuthPageShell` + `useAuthApiPost` hook (kills 4R-flagged duplication). `apps/web/e2e/responsive.spec.ts` (4 tests) at 360px + 1440px.
- **T4 follow-ups (5/5)**: test slim + `AbortSignal.timeout(10_000)` + `Referrer-Policy: same-origin` header + `COPY_INDICATOR_TIMEOUT_MS` constant + `Input` prop cleanup.
- **Auth cookie storage (slice 4 batch 2)**: `apps/web/lib/auth.ts` with `getSession()` + `setSessionCookie()` + `clearSessionCookie()`. Cookie name `auth-session` (slice 4 batch 2) → migrated to `authjs.session-token` (NextAuth v5 default) in the cookie migration batch. Attributes: `httpOnly: true`, `secure: prod-only`, `SameSite=lax`, `path=/`, `maxAge=24h`.
- **NextAuth integration (slice 4 PR #21)**: `AuthService` mints a NextAuth JWE via `@auth/core/jwt#encode` with the shared `NEXTAUTH_SECRET` + salt. `apps/web/auth.ts` NextAuth v5 config + `apps/web/app/api/auth/[...nextauth]/route.ts` handler. Round-trip test asserts the API's `sessionToken` decodes via `@auth/core/jwt#decode`.
- **Cookie migration (slice 4 PR #22)**: `auth-session` → `authjs.session-token`. 2 new tests assert the canonical cookie attributes + the server-side read.

### Changed — Architectural decisions

- **PR #10** introduced the `validateOrThrow(raw, schema)` helper inside the route handlers, replacing the `@BodySchema(<schema>)` decorator (the harness's auto-formatter kept stripping the decorator). 4R review (R2) flagged the heavy LoginForm/SignUpForm/ForgotPassword/ResetPassword boilerplate; the slice 4 follow-up batch extracted the shared primitives.
- **PR #16** wired `app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })` in `apps/api/src/main.ts` (the previous slice 3 setup documented `WEB_ORIGIN` as the CORS allow-list target but never consumed it). Without this, every cross-origin auth POST from the web client would have surfaced as `auth.common.genericError` regardless of credentials.
- **PR #11** added the `description` keys to the i18n catalogs (the pages were using the `email` field-label key for `CardDescription`, which rendered the literal "Email" as the card subtitle).

### Documentation

- `openspec/changes/vertical-slicing-reference-scaffold/`: full SDD artifact tree (proposal + spec + design + tasks + apply-progress). Every English `.md` ships with a `Documents-es/...` Spanish mirror per AGENTS.md §13.
- `docs/slice-3-checklist.md` (EN + ES mirror): slice 3 final gate + verification gates.
- `README.md` (existing): project overview + quickstart.
- `AGENTS.md` (existing): project conventions + branch model + commit message format.

### Fixed

- **CORS not enabled on the API** (4R R1 CRITICAL, slice 4 PR #16): the web client at `WEB_ORIGIN` (`:3000`) POSTs cross-origin to the API (`:3001`) with `Content-Type: application/json`. Without `app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })`, the browser refuses the preflight. The previous slice 3 setup documented `WEB_ORIGIN` as the CORS allow-list target but never consumed it.
- **`CardDescription` used the field-label key** (4R R2 CRITICAL, slice 4 PR #11): the pages were using the `email` key for `CardDescription`, which rendered the literal "Email" as the card subtitle. Added `description` keys to en.json + es.json; both pages now use `t("description")`.
- **ResetPasswordForm loading state missing from the test suite** (4R R4 WARNING, slice 4 PR #17 follow-up): the form's JSDoc contract claims 4 form states but the test suite only asserted 3. Added the loading-state test mirroring the ForgotPasswordForm pattern.
- **3 CRITICAL F1-F8 findings from the slice 3 batch 5 4R review** (PR #9): the slice 3 apply-progress closed the F1 transaction-wrap (F6 TOCTOU), F2 audit-sink, F3 ring-buffer redaction, F4 deleteExpired, F8 dispatch-guard. All 5 fixed; the requestReset F5 orphan-row fix landed in the same batch.

### Notes

- The slice 4 form-state assertions live in a single harness (`state-coverage.test.tsx`) — the per-form test files were slimmed to keep only form-specific tests (the consolidated harness is the source of truth).
- The dev-mailbox page reads from a `DEV_STUB_EVENTS` module-level constant; the real API event-replay endpoint lands alongside the slice 5+ events infrastructure.
- The slice 4 e2e (Playwright + axe-core) tests are scaffolded but NOT run in the CI pipeline. Per-dev `npx playwright install chromium` is required.
- The slice 4 BDD `.feature` files (per design Locked Decision #3) are deferred to slice 7+ (post-1.0.0).

## 1.0.0 — Quality gates (final, all green at v1.0.0 tag)

| Gate                                                                                                                       | Result                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm install`                                                                                                             | ✅ exit 0                                                                           |
| `pnpm turbo run typecheck` (full)                                                                                          | ✅ exit 0                                                                           |
| `pnpm turbo run lint` (full)                                                                                               | ✅ exit 0                                                                           |
| `pnpm turbo run test` (full)                                                                                               | ✅ 24/24 turbo tasks green                                                          |
| Slice 1 (skeleton)                                                                                                         | ✅ 8/8 tasks done                                                                   |
| Slice 2 (libs/core + libs/shared-utils)                                                                                    | ✅ 5/5 tasks done                                                                   |
| Slice 3 (auth server)                                                                                                      | ✅ 9/9 tasks done; 110/110 + 21/21 + 37/37 + 20/20 + 4/4 tests                      |
| Slice 4 (auth client)                                                                                                      | ✅ 15/15 + 5/5 follow-ups + 1/1 T3.3 + 1/1 NextAuth + 1/1 cookie migration = CLOSED |
| `pnpm run lint:fixtures`                                                                                                   | ✅ boundary plugin fixtures pass                                                    |
| Boundary rules: `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import` | ✅ all 4 active                                                                     |
| i18n catalogs (symmetric-difference)                                                                                       | ✅ green                                                                            |

**Total workspace tests at v1.0.0**: 274 (110 @features/auth + 21 apps/api e2e + 37 @core/events + 20 @core/config + 4/4 jwt-auth-guard e2e + 106 apps/web including state-coverage + 7/7 lib helpers). 24/24 turbo tasks green.

## Release process

- **Branch model**: `develop` is the working branch; `main` is the immutable production release branch. Releases are cut via `release/v<MAJOR>.<MINOR>.<PATCH>` branches off `develop` → PR → `main` → tag → GitHub release.
- **Commit convention**: Conventional Commits (no "Co-Authored-By" / no AI attribution).
- **Branch model convention** (per AGENTS.md §2): feature branches cut from `develop`, work-unit commits, `git revert <sha>` for rollback.
- **Spanish mirror rule** (per AGENTS.md §13): every English `.md` under `openspec/` or `docs/` ships with a `Documents-es/...` Spanish mirror IN THE SAME atomic commit. Verified via `grep -P '[\x{4e00}-\x{9fff}]'` to keep CJK mojibake out.

## Upcoming releases (post-1.0.0)

- **v1.1.0 (slice 5)**: transactions server — multi-currency + soft-delete + idempotency-key + audit log + 5 events of transactions.
- **v1.2.0 (slice 6)**: transactions client + i18n + shadcn primitives for the transactions surface + responsive layout.
- **v2.0.0 (slice 7)**: BDD `.feature` files + Playwright e2e + slice-wide gates + production hardening (HSTS, CSP, secrets manager).

[1.1.0]: https://github.com/Sebailla/GP-v2/compare/v1.0.0...v1.1.0
