# Tasks — module-6-reports (Reports & Analytics)

> **Author**: Sebastián Illa
> **Created**: 2026-07-29
> **Phase**: SDD tasks (planning complete; ready for `sdd-apply`)
> **Source**: `openspec/changes/module-6-reports/{proposal,specs/reports/spec,design}.md`
> **Delivery strategy** (per preflight cache): **auto-chain**
> **Chain strategy** (per preflight cache): **feature-branch-chain**
> **Review budget**: 400 lines (soft cap per PR; PRs auto-chained beyond it)

## Review Workload Forecast

| Metric | Value |
| --- | --- |
| New files | ~50 (TS + .md + .feature + .test) |
| Estimated changed lines | ~1,800–2,400 (incl. tests + ES mirrors) |
| Estimated per-PR lines (if chained) | ~300–600 each |
| 400-line budget risk | **HIGH** |
| Chained PRs recommended | **Yes — auto-chain (preflight cached)** |
| Branch model | `feat/module-6-reports` is the **tracker**; child PRs target the previous PR branch |

**Rationale**: vertical slice with ~50 files (port, service, controller, 7 client components, BDD bridge, tests, ES mirrors). Single-PR would be 1500+ lines — exceeds budget by 4×. Auto-chain splits it into reviewable slices.

---

## PR chain plan

The tracker branch `feat/module-6-reports` accumulates final integration. Each PR below targets the previous PR's branch (per `chain_strategy: feature-branch-chain`), so review diffs stay focused. Only the final PR merges to `develop`.

### PR #1 — Foundation: shared schemas + reports package skeleton (PR of 1 of 5)

**Scope**:
- `libs/features/reports/package.json` (workspace package, name `@features/reports`)
- `libs/features/reports/tsconfig.json`
- `libs/features/reports/vitest.config.ts`
- `libs/features/reports/src/shared/schemas/index.ts` (barrel)
- `libs/features/reports/src/shared/schemas/report-query.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/schemas/report-summary.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/schemas/report-by-category.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/schemas/report-by-period.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/__tests__/*.test.ts` for each schema (4 files)
- `pnpm-workspace.yaml` updated to include `libs/features/reports`
- `tsconfig.base.json` updated with `@features/reports` path alias

**Atomic commits**:
1. `chore(monorepo): scaffold @features/reports workspace package + path alias`
2. `test(reports): RED — strict-shape contract for report-query.schema`
3. `feat(reports): GREEN — report-query.schema (fromDate/toDate/currencyCode, range cap 365d)`
4. `test(reports): RED — report-summary.schema shape contract`
5. `feat(reports): GREEN — report-summary.schema (income/expense/net/fxFreshness)`
6. `test(reports): RED — report-by-category.schema contract`
7. `feat(reports): GREEN — report-by-category.schema (categoryId/total/share)`
8. `test(reports): RED — report-by-period.schema contract`
9. `feat(reports): GREEN — report-by-period.schema (current/previous/delta)`

**Forecast lines**: ~300 (incl. tests).
**Quality gates**: `pnpm install`, `pnpm turbo run typecheck test`.
**Rollback**: `git revert <pr-sha>` cleanly removes the package.

### PR #2 — Domain: ReportsRepository port + TimeBucketService + CSV serializer (PR 2 of 5)

**Scope**:
- `libs/features/reports/src/server/domain/ports/reports.repository.ts` (port interface + types)
- `libs/features/reports/src/server/domain/ports/reports.repository.token.ts` (DI token)
- `libs/features/reports/src/server/domain/services/time-bucket.service.ts` (RED + GREEN + TRIANGULATE)
- `libs/features/reports/src/server/domain/services/csv-serializer.ts` (RED + GREEN + TRIANGULATE, incl. injection guard)
- `libs/features/reports/src/server/__tests__/time-bucket.service.test.ts`
- `libs/features/reports/src/server/__tests__/csv-serializer.test.ts`

**Atomic commits**:
1. `feat(reports): add ReportsRepository port (read-only aggregation seam)`
2. `test(reports): RED — TimeBucketService.bucketize empty range + single tx`
3. `feat(reports): GREEN — TimeBucketService.bucketize (week/month buckets)`
4. `test(reports): TRIANGULATE — TimeBucketService DST boundary + leap day + inverted range`
5. `test(reports): RED — csvSerializer.serialize (BOM + CRLF + basic row)`
6. `feat(reports): GREEN — csvSerializer.serialize (UTF-8 BOM + CRLF)`
7. `test(reports): RED — csvSerializer injection guard (=+-@ prefix)`
8. `feat(reports): GREEN — csvSerializer injection guard + quote-doubling`

**Forecast lines**: ~350 (incl. tests).
**Quality gates**: `pnpm turbo run typecheck test`.
**Rollback**: clean revert.

### PR #3 — Service + NestJS controller + Prisma adapter + wire-up (PR 3 of 5)

**Scope**:
- `libs/features/reports/src/server/domain/services/reports.service.ts` (RED + GREEN + TRIANGULATE)
- `libs/features/reports/src/server/infrastructure/adapters/prisma-reports.repository.ts` (impl)
- `libs/features/reports/src/server/http/reports.controller.ts`
- `libs/features/reports/src/server/http/reports.module.ts`
- `libs/features/reports/src/server/http/decorators/user-id.decorator.ts`
- `apps/api/src/modules/reports/reports.module.ts` (wires the controller)
- `apps/api/src/app.module.ts` updated to import `ReportsModule`
- `apps/api/src/modules/reports/__tests__/reports.controller.test.ts` (integration)
- `libs/features/reports/src/server/__tests__/prisma-reports.repository.integration.test.ts` (real Postgres)
- `libs/features/reports/src/server/__tests__/reports.service.test.ts` (unit, mocked repo + FX)
- `apps/api/package.json` updated with `@features/reports` dependency

**Atomic commits**:
1. `feat(reports): add UserId decorator (request.user → method param)`
2. `test(reports): RED — ReportsService.getSummary (mocked repo + FX)`
3. `feat(reports): GREEN — ReportsService.getSummary`
4. `test(reports): TRIANGULATE — ReportsService FX-normalize + fxFreshness banner`
5. `feat(reports): ReportsService.getByCategory + getByPeriod + exportCsv`
6. `feat(reports): PrismaReportsRepository impl (uses existing PrismaTransactionRepository + CategoryRepository)`
7. `test(reports): INTEGRATION — PrismaReportsRepository against test Postgres (cross-user isolation)`
8. `feat(api): ReportsModule wiring + controller 4 endpoints`
9. `test(api): REPORTS controller integration (NestJS Test module, JwtAuthGuard mock)`
10. `chore(api): observability counters on /api/reports/* endpoints`

**Forecast lines**: ~600 (incl. tests; large because of 4 endpoints + cross-user isolation test + 4 service methods).
**Quality gates**: `pnpm turbo run build lint typecheck test`, `pnpm lint:fixtures`, `pnpm turbo run bdd` (BDD bridge wired in PR #4 but stubbed until then).
**Rollback**: clean revert.

### PR #4 — BDD bridge + feature file + step definitions (PR 4 of 5)

**Scope**:
- `libs/features/reports/docs/reports.feature` (Gherkin scenarios S1–S20 from spec)
- `libs/features/reports/docs/step-defs/realm.steps.ts` (binding mirror of slice-8 auth)
- `libs/features/reports/docs/step-defs/summary.steps.ts`
- `libs/features/reports/docs/step-defs/breakdown.steps.ts`
- `libs/features/reports/docs/step-defs/comparison.steps.ts`
- `libs/features/reports/docs/step-defs/export.steps.ts`
- `libs/features/reports/docs/step-defs/auth.steps.ts`
- `libs/features/reports/docs/support/world.ts`
- `libs/features/reports/docs/support/fixture-loader.ts`
- `apps/api/cucumber.json` extended to include `libs/features/reports/docs/**/*.feature`
- Update BDD scripts to include the new features
- Update CI workflow (`.github/workflows/ci.yml`) to run the new BDD scenarios

**Atomic commits**:
1. `chore(bdd): add libs/features/reports to cucumber.json features glob`
2. `feat(reports): reports.feature (20 Gherkin scenarios)`
3. `feat(reports): step-defs/realm.steps.ts (binding mirror of slice-8 auth pattern)`
4. `feat(reports): step-defs/auth.steps.ts (Given authenticated user)`
5. `feat(reports): step-defs/{summary,breakdown,comparison,export}.steps.ts`
6. `feat(reports): support/world.ts + support/fixture-loader.ts (5 transactions seed)`
7. `fix(bdd): reports scenarios GREEN — all 20 scenarios pass`

**Forecast lines**: ~400 (incl. feature file + 5 step def files + fixtures).
**Quality gates**: `pnpm turbo run bdd`, full E2E suite.
**Rollback**: clean revert.

### PR #5 — Page UI + i18n catalogs + client components + Recharts (PR 5 of 5)

**Scope**:
- `apps/web/app/[locale]/(app)/reports/page.tsx` (server component)
- `apps/web/messages/en/reports.json` (next-intl catalog, EN)
- `apps/web/messages/es/reports.json` (next-intl catalog, ES)
- `libs/features/reports/src/client/reports-workspace.tsx` (container)
- `libs/features/reports/src/client/reports-filter-bar.tsx`
- `libs/features/reports/src/client/monthly-summary-card.tsx` (Recharts BarChart)
- `libs/features/reports/src/client/category-breakdown-table.tsx` (shadcn Table)
- `libs/features/reports/src/client/period-comparison-panel.tsx` (Recharts LineChart + delta header)
- `libs/features/reports/src/client/export-csv-button.tsx`
- `libs/features/reports/src/client/fx-staleness-banner.tsx`
- `libs/features/reports/src/client/reports-empty-state.tsx`
- `libs/features/reports/src/client/reports-error-state.tsx`
- `libs/features/reports/src/client/reports-loading-state.tsx`
- `libs/features/reports/src/client/hooks/use-reports-summary.ts`
- `libs/features/reports/src/client/hooks/use-reports-by-category.ts`
- `libs/features/reports/src/client/hooks/use-reports-by-period.ts`
- `libs/features/reports/src/client/hooks/use-reports-csv.ts`
- `libs/features/reports/src/client/api/reports-api.ts` (typed fetchers)
- 6 × `libs/features/reports/src/client/__tests__/*.test.tsx` (5-state coverage)
- `apps/web/package.json` updated with `recharts` + `@features/reports` deps
- `apps/web/e2e/reports.spec.ts` (Playwright, both locales + axe)

**Atomic commits**:
1. `chore(web): add recharts to apps/web dependencies`
2. `feat(reports): typed fetchers (api/reports-api.ts) + 4 hooks (summary/breakdown/period/csv)`
3. `feat(reports): reports-filter-bar (presets + custom + bucket)`
4. `feat(reports): monthly-summary-card (BarChart) + 5-state coverage tests`
5. `feat(reports): category-breakdown-table (shadcn Table) + 5-state coverage tests`
6. `feat(reports): period-comparison-panel (LineChart + delta header) + 5-state coverage tests`
7. `feat(reports): export-csv-button (two buttons) + 5-state coverage tests`
8. `feat(reports): reports-empty-state (CTA to /transactions/new)`
9. `feat(reports): reports-error-state + reports-loading-state + fx-staleness-banner`
10. `feat(reports): reports-workspace (container) + 5-state coverage tests`
11. `feat(web): reports/page.tsx (server component, locale-aware)`
12. `feat(i18n): next-intl catalogs (en + es) under apps/web/messages/{en,es}/reports.json`
13. `test(e2e): reports.spec.ts — Playwright + axe (both locales)`
14. `test(reports): workspace integration test — 5-state coverage end-to-end`

**Forecast lines**: ~900 (largest PR — 7 components + 6 hooks + page + i18n + 6 test files).
**Quality gates**: `pnpm turbo run build lint typecheck test`, `pnpm lint:fixtures`, `pnpm turbo run bdd e2e`.
**Rollback**: clean revert.

---

## Cross-cutting tasks (apply phase, embedded in PRs above)

- [x] Branch created: `feat/module-6-reports` from `develop` (worktree at `~/.../gastos-personales-reference-worktrees/module-6-reports`).
- [x] Spec created + ES mirror (PR #1 lands spec).
- [x] Design created + ES mirror (PR #1 lands design).
- [x] `openspec/specs/reports/spec.md` created + ES mirror — `Documents-es/openspec/specs/reports/spec.md` (capability spec landed with PR #1 sync to `openspec/specs/`).
- [x] Each PR's atomic commits per the work-unit-commit convention.
- [x] No "Co-Authored-By" / no AI attribution in any commit message.
- [x] Boundary fixtures lint stays green (`pnpm lint:fixtures`).
- [x] BDD bridge follows slice-8 auth pattern (binding.ts with quoted-prefix).
- [x] Strict TDD: every test file lands RED before the implementation file.
- [x] ES mirror is in the same atomic commit as the English version (per AGENTS.md §13).
- [x] CJK check on ES files: `perl -ne 'print if /\p{Han}/'` returns empty.

## Quality gates summary

After PR #5 merges to develop:

| Gate | Command | Expected |
| --- | --- | --- |
| Install | `pnpm install` | exits 0 |
| DB | `pnpm db:up && docker compose ps` | Postgres healthy |
| Build | `pnpm turbo run build` | exits 0 |
| Lint | `pnpm turbo run lint` | exits 0 |
| Typecheck | `pnpm turbo run typecheck` | exits 0 |
| Test | `pnpm turbo run test` | exits 0 (incl. ~50 new tests) |
| Boundary fixtures | `pnpm lint:fixtures` | exits 0 |
| BDD | `pnpm turbo run bdd` | exits 0 (20 reports scenarios green) |
| E2E | `pnpm turbo run e2e` | exits 0 (reports.spec.ts green in both locales + axe) |

## Tracking

Apply-phase progress will be persisted to Engram topic key `sdd/module-6-reports/apply-progress` per the orchestrator's protocol. Each PR's atomic commit lands a `[x]` marker update in this file at the next opportunity.

## Next phase

`sdd-apply` — execute PR #1 (foundation: shared schemas + workspace package skeleton).
