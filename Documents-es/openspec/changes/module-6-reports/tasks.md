# Tasks — module-6-reports (Reports & Analytics)

> **Autor**: Sebastián Illa
> **Fecha**: 2026-07-29
> **Phase**: SDD tasks (planning completo; listo para `sdd-apply`)
> **Source**: `openspec/changes/module-6-reports/{proposal,specs/reports/spec,design}.md`
> **Delivery strategy** (per preflight cache): **auto-chain**
> **Chain strategy** (per preflight cache): **feature-branch-chain**
> **Review budget**: 400 líneas (soft cap por PR; PRs auto-chainados pasado eso)

## Review Workload Forecast

| Métrica | Valor |
| --- | --- |
| Archivos nuevos | ~50 (TS + .md + .feature + .test) |
| Líneas estimadas cambiadas | ~1,800–2,400 (incl. tests + ES mirrors) |
| Líneas estimadas por PR (si chained) | ~300–600 cada uno |
| Riesgo de budget 400 líneas | **HIGH** |
| Chained PRs recomendados | **Sí — auto-chain (preflight cacheado)** |
| Modelo de branch | `feat/module-6-reports` es el **tracker**; los PRs hijos targetean el branch del PR previo |

**Rationale**: vertical slice con ~50 archivos (port, service, controller, 7 componentes client, BDD bridge, tests, ES mirrors). Un solo PR serían 1500+ líneas — excede el budget por 4×. Auto-chain lo divide en slices revisables.

---

## Plan de chain de PRs

El branch tracker `feat/module-6-reports` acumula la integración final. Cada PR abajo targetea el branch del PR previo (per `chain_strategy: feature-branch-chain`), así los diffs de review quedan focused. Solo el PR final mergea a `develop`.

### PR #1 — Foundation: shared schemas + skeleton del package reports (PR 1 de 5)

**Scope**:
- `libs/features/reports/package.json` (paquete workspace, nombre `@features/reports`)
- `libs/features/reports/tsconfig.json`
- `libs/features/reports/vitest.config.ts`
- `libs/features/reports/src/shared/schemas/index.ts` (barrel)
- `libs/features/reports/src/shared/schemas/report-query.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/schemas/report-summary.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/schemas/report-by-category.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/schemas/report-by-period.schema.ts` (RED + GREEN)
- `libs/features/reports/src/shared/__tests__/*.test.ts` por cada schema (4 archivos)
- `pnpm-workspace.yaml` actualizado para incluir `libs/features/reports`
- `tsconfig.base.json` actualizado con path alias `@features/reports`

**Commits atómicos**:
1. `chore(monorepo): scaffold @features/reports workspace package + path alias`
2. `test(reports): RED — strict-shape contract for report-query.schema`
3. `feat(reports): GREEN — report-query.schema (fromDate/toDate/currencyCode, range cap 365d)`
4. `test(reports): RED — report-summary.schema shape contract`
5. `feat(reports): GREEN — report-summary.schema (income/expense/net/fxFreshness)`
6. `test(reports): RED — report-by-category.schema contract`
7. `feat(reports): GREEN — report-by-category.schema (categoryId/total/share)`
8. `test(reports): RED — report-by-period.schema contract`
9. `feat(reports): GREEN — report-by-period.schema (current/previous/delta)`

**Forecast líneas**: ~300 (incl. tests).
**Quality gates**: `pnpm install`, `pnpm turbo run typecheck test`.
**Rollback**: `git revert <pr-sha>` limpia el package.

### PR #2 — Domain: ReportsRepository port + TimeBucketService + CSV serializer (PR 2 de 5)

**Scope**:
- `libs/features/reports/src/server/domain/ports/reports.repository.ts` (port interface + types)
- `libs/features/reports/src/server/domain/ports/reports.repository.token.ts` (DI token)
- `libs/features/reports/src/server/domain/services/time-bucket.service.ts` (RED + GREEN + TRIANGULATE)
- `libs/features/reports/src/server/domain/services/csv-serializer.ts` (RED + GREEN + TRIANGULATE, incl. injection guard)
- `libs/features/reports/src/server/__tests__/time-bucket.service.test.ts`
- `libs/features/reports/src/server/__tests__/csv-serializer.test.ts`

**Commits atómicos**:
1. `feat(reports): add ReportsRepository port (read-only aggregation seam)`
2. `test(reports): RED — TimeBucketService.bucketize empty range + single tx`
3. `feat(reports): GREEN — TimeBucketService.bucketize (week/month buckets)`
4. `test(reports): TRIANGULATE — TimeBucketService DST boundary + leap day + inverted range`
5. `test(reports): RED — csvSerializer.serialize (BOM + CRLF + basic row)`
6. `feat(reports): GREEN — csvSerializer.serialize (UTF-8 BOM + CRLF)`
7. `test(reports): RED — csvSerializer injection guard (=+-@ prefix)`
8. `feat(reports): GREEN — csvSerializer injection guard + quote-doubling`

**Forecast líneas**: ~350 (incl. tests).
**Quality gates**: `pnpm turbo run typecheck test`.
**Rollback**: revert limpio.

### PR #3 — Service + NestJS controller + Prisma adapter + wire-up (PR 3 de 5)

**Scope**:
- `libs/features/reports/src/server/domain/services/reports.service.ts` (RED + GREEN + TRIANGULATE)
- `libs/features/reports/src/server/infrastructure/adapters/prisma-reports.repository.ts` (impl)
- `libs/features/reports/src/server/http/reports.controller.ts`
- `libs/features/reports/src/server/http/reports.module.ts`
- `libs/features/reports/src/server/http/decorators/user-id.decorator.ts`
- `apps/api/src/modules/reports/reports.module.ts` (wire del controller)
- `apps/api/src/app.module.ts` actualizado para importar `ReportsModule`
- `apps/api/src/modules/reports/__tests__/reports.controller.test.ts` (integration)
- `libs/features/reports/src/server/__tests__/prisma-reports.repository.integration.test.ts` (Postgres real)
- `libs/features/reports/src/server/__tests__/reports.service.test.ts` (unit, repo + FX mockeados)
- `apps/api/package.json` actualizado con `@features/reports` dependency

**Commits atómicos**:
1. `feat(reports): add UserId decorator (request.user → method param)`
2. `test(reports): RED — ReportsService.getSummary (mocked repo + FX)`
3. `feat(reports): GREEN — ReportsService.getSummary`
4. `test(reports): TRIANGULATE — ReportsService FX-normalize + fxFreshness banner`
5. `feat(reports): ReportsService.getByCategory + getByPeriod + exportCsv`
6. `feat(reports): PrismaReportsRepository impl (uses existing PrismaTransactionRepository + CategoryRepository)`
7. `test(reports): INTEGRATION — PrismaReportsRepository contra test Postgres (cross-user isolation)`
8. `feat(api): ReportsModule wiring + controller 4 endpoints`
9. `test(api): REPORTS controller integration (NestJS Test module, JwtAuthGuard mock)`
10. `chore(api): observability counters sobre /api/reports/* endpoints`

**Forecast líneas**: ~600 (incl. tests; grande por 4 endpoints + cross-user isolation test + 4 métodos de service).
**Quality gates**: `pnpm turbo run build lint typecheck test`, `pnpm lint:fixtures`, `pnpm turbo run bdd` (BDD bridge wireado en PR #4 pero stubbed hasta entonces).
**Rollback**: revert limpio.

### PR #4 — BDD bridge + feature file + step definitions (PR 4 de 5)

**Scope**:
- `libs/features/reports/docs/reports.feature` (escenarios Gherkin S1–S20 del spec)
- `libs/features/reports/docs/step-defs/realm.steps.ts` (binding mirror de slice-8 auth)
- `libs/features/reports/docs/step-defs/summary.steps.ts`
- `libs/features/reports/docs/step-defs/breakdown.steps.ts`
- `libs/features/reports/docs/step-defs/comparison.steps.ts`
- `libs/features/reports/docs/step-defs/export.steps.ts`
- `libs/features/reports/docs/step-defs/auth.steps.ts`
- `libs/features/reports/docs/support/world.ts`
- `libs/features/reports/docs/support/fixture-loader.ts`
- `apps/api/cucumber.json` extendido para incluir `libs/features/reports/docs/**/*.feature`
- Scripts BDD actualizados para incluir las nuevas features
- Workflow de CI (`.github/workflows/ci.yml`) actualizado para correr los nuevos escenarios BDD

**Commits atómicos**:
1. `chore(bdd): add libs/features/reports a cucumber.json features glob`
2. `feat(reports): reports.feature (20 escenarios Gherkin)`
3. `feat(reports): step-defs/realm.steps.ts (binding mirror del patrón slice-8 auth)`
4. `feat(reports): step-defs/auth.steps.ts (Given usuario autenticado)`
5. `feat(reports): step-defs/{summary,breakdown,comparison,export}.steps.ts`
6. `feat(reports): support/world.ts + support/fixture-loader.ts (seed de 5 transactions)`
7. `fix(bdd): reports escenarios GREEN — todos los 20 escenarios pasan`

**Forecast líneas**: ~400 (incl. feature file + 5 step def files + fixtures).
**Quality gates**: `pnpm turbo run bdd`, suite E2E completa.
**Rollback**: revert limpio.

### PR #5 — Page UI + i18n catalogs + client components + Recharts (PR 5 de 5)

**Scope**:
- `apps/web/app/[locale]/(app)/reports/page.tsx` (server component)
- `apps/web/messages/en/reports.json` (catálogo next-intl, EN)
- `apps/web/messages/es/reports.json` (catálogo next-intl, ES)
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
- `libs/features/reports/src/client/api/reports-api.ts` (fetchers tipados)
- 6 × `libs/features/reports/src/client/__tests__/*.test.tsx` (cobertura 5 estados)
- `apps/web/package.json` actualizado con `recharts` + `@features/reports` deps
- `apps/web/e2e/reports.spec.ts` (Playwright, ambos locales + axe)

**Commits atómicos**:
1. `chore(web): add recharts a apps/web dependencies`
2. `feat(reports): typed fetchers (api/reports-api.ts) + 4 hooks (summary/breakdown/period/csv)`
3. `feat(reports): reports-filter-bar (presets + custom + bucket)`
4. `feat(reports): monthly-summary-card (BarChart) + 5-state coverage tests`
5. `feat(reports): category-breakdown-table (shadcn Table) + 5-state coverage tests`
6. `feat(reports): period-comparison-panel (LineChart + delta header) + 5-state coverage tests`
7. `feat(reports): export-csv-button (dos botones) + 5-state coverage tests`
8. `feat(reports): reports-empty-state (CTA a /transactions/new)`
9. `feat(reports): reports-error-state + reports-loading-state + fx-staleness-banner`
10. `feat(reports): reports-workspace (container) + 5-state coverage tests`
11. `feat(web): reports/page.tsx (server component, locale-aware)`
12. `feat(i18n): next-intl catalogs (en + es) bajo apps/web/messages/{en,es}/reports.json`
13. `test(e2e): reports.spec.ts — Playwright + axe (ambos locales)`
14. `test(reports): workspace integration test — 5-state coverage end-to-end`

**Forecast líneas**: ~900 (PR más grande — 7 componentes + 6 hooks + page + i18n + 6 archivos de tests).
**Quality gates**: `pnpm turbo run build lint typecheck test`, `pnpm lint:fixtures`, `pnpm turbo run bdd e2e`.
**Rollback**: revert limpio.

---

## Cross-cutting tasks (fase apply, embebidas en los PRs arriba)

- [x] Branch creado: `feat/module-6-reports` desde `develop` (worktree en `~/.../gastos-personales-reference-worktrees/module-6-reports`).
- [x] Spec creado + ES mirror (PR #1 landea spec).
- [x] Design creado + ES mirror (PR #1 landea design).
- [x] `openspec/specs/reports/spec.md` creado + ES mirror — `Documents-es/openspec/specs/reports/spec.md` (capability spec landeada con PR #1 sync a `openspec/specs/`).
- [x] Cada PR con commits atómicos según la convención work-unit-commit.
- [x] Sin "Co-Authored-By" / sin AI attribution en ningún commit message.
- [x] Boundary fixtures lint sigue verde (`pnpm lint:fixtures`).
- [x] BDD bridge sigue el patrón slice-8 auth (binding.ts con quoted-prefix).
- [x] Strict TDD: cada archivo de test landea RED antes que el archivo de impl.
- [x] ES mirror en el mismo commit atómico que la versión en inglés (per AGENTS.md §13).
- [x] Check CJK en archivos ES: `perl -ne 'print if /\p{Han}/'` retorna vacío.

## Quality gates summary

Después que PR #5 mergee a develop:

| Gate | Comando | Esperado |
| --- | --- | --- |
| Install | `pnpm install` | exits 0 |
| DB | `pnpm db:up && docker compose ps` | Postgres healthy |
| Build | `pnpm turbo run build` | exits 0 |
| Lint | `pnpm turbo run lint` | exits 0 |
| Typecheck | `pnpm turbo run typecheck` | exits 0 |
| Test | `pnpm turbo run test` | exits 0 (incl. ~50 tests nuevos) |
| Boundary fixtures | `pnpm lint:fixtures` | exits 0 |
| BDD | `pnpm turbo run bdd` | exits 0 (20 reportes scenarios verdes) |
| E2E | `pnpm turbo run e2e` | exits 0 (reports.spec.ts verde en ambos locales + axe) |

## Tracking

El progreso de apply-phase se persiste en Engram topic key `sdd/module-6-reports/apply-progress` según el protocolo del orchestrator. Cada PR con commits atómicos landea un `[x]` marker update en este archivo en la próxima oportunidad.

## Next phase

`sdd-apply` — ejecutar PR #1 (foundation: shared schemas + skeleton del package workspace).
