# Delta Spec — `fix-orphan-shared-directories`

> **Project**: `gastos-personales-reference` (`gp-v2`) · **Date**: 2026-07-14
> **Mode**: `auto` · **Store**: hybrid · **Strict TDD**: ACTIVE
> **Shape**: A · **Delivery**: single PR; `auto-chain` not triggered
> **Sources**: proposal Engram `#2384`; explore Engram `#2382`

## 1. Header

Status: draft · spec phase. The change promotes both feature `shared/` schema trees to workspace packages and removes pnpm-store resolution workarounds.

## 2. Intent

Make dependency ownership explicit so bare `zod` imports resolve through normal package resolution rather than duplicated app `tsconfig` paths into pnpm internals.

## 3. Goals

- **G1**: Both shared directories are workspace packages.
- **G2**: pnpm recognizes both packages.
- **G3**: Both app `zod` workarounds are removed.
- **G4**: All 11 importers still resolve without source-import churn.
- **G5**: The full Turbo pipeline passes.
- **G6**: Baseline test counts remain unchanged.
- **G7**: Prior slice/fix behavior and boundary fixtures do not regress.

## 4. Non-Goals

No schema edits, importer rewrites, per-package `tsconfig.json`, server-package changes, dependency upgrades, boundary-rule changes, or package consolidation.

## 5. Functional Requirements

- **R1 (MUST)**: `libs/features/auth/shared/package.json` MUST declare `name: "@features/auth/shared"`, `version: "0.0.0"`, `private: true`, `main: "./src/index.ts"`, and `dependencies: { zod: "4.4.3" }`.
- **R2 (MUST)**: `libs/features/transactions/shared/package.json` MUST have the R1 shape with `name: "@features/transactions/shared"`.
- **R3 (MUST)**: Each package MUST contain `src/index.ts` re-exporting every schema module, including forms such as `export * from "./schemas/login"`.
- **R4 (MUST)**: `pnpm-workspace.yaml` MUST declare both packages explicitly or through a covering `packages` glob.
- **R5 (MUST)**: `apps/api/tsconfig.json` MUST remove `paths.zod` and its three-line JSDoc; no `zod` reference may remain.
- **R6 (MUST)**: `apps/web/tsconfig.json` MUST remove `paths.zod` and any associated JSDoc; no `zod` reference may remain.
- **R7 (MUST)**: All 11 importers MUST resolve correctly with existing relative/alias imports preserved.
- **R8 (MUST)**: `pnpm turbo run test bdd lint typecheck build` MUST exit 0.
- **R9 (MUST)**: Web 145/145, API 22/22, and BDD 43/43 MUST pass.
- **R10 (SHOULD)**: `docs/architecture/decisions/0011-shared-as-workspace-packages.md` and its Spanish mirror SHOULD document the decision.
- **R11 (SHOULD)**: Each new manifest SHOULD carry a JSDoc-style explanation of why the shared package boundary exists.

## 6. Scenarios

```gherkin
Scenario: Shared workspace packages exist
  Given both shared directories previously had no package.json
  When the fix is applied
  Then each package.json MUST exist with its specified package name
  And each MUST declare zod version 4.4.3 as a dependency

Scenario: pnpm recognizes the new packages
  Given the two new package.json files exist
  When pnpm install --frozen-lockfile runs
  Then pnpm MUST recognize both package names as workspace packages
  And pnpm-workspace.yaml MUST contain a covering declaration

Scenario: App tsconfig workarounds are removed
  Given both app tsconfigs previously mapped paths.zod to pnpm internals
  When the fix is applied
  Then both paths.zod mappings and associated comments MUST be absent
  And no zod reference MUST remain in either app tsconfig

Scenario: All 11 importers continue to resolve zod
  Given both workspace packages declare zod and importer paths are preserved
  When pnpm install and the build run
  Then all 11 importers MUST resolve through normal package resolution
  And no TS2307 error MUST be reported

Scenario: Full Turbo pipeline passes
  Given the fix has been applied
  When pnpm turbo run test bdd lint typecheck build runs
  Then every requested task MUST exit 0

Scenario: Test counts match the baseline
  Given the fix has been applied
  When the API, web, and BDD suites run
  Then API MUST report 22/22 and web MUST report 145/145 passing
  And BDD MUST report 43/43 scenarios passing

Scenario: Prior slices and boundary rules do not regress
  Given the slice-7 and slice-8 chains and prior fixes are green
  When the full pipeline, lint fixtures, and Cucumber suite run
  Then all MUST pass without regression
```

## 7. Constraint Surface

Schemas remain under feature `shared/schemas`; no client-to-server or cross-feature imports are introduced. Strict TDD requires observing resolution failure before production/config changes, then GREEN via focused typecheck/build, triangulation through all importers, and full refactor verification. The ADR requires the mandated Spanish mirror; this change spec intentionally has none per parent instruction.

## 8. Test Plan

| Coverage | Command | Expected |
|---|---|---|
| Workspace install | `pnpm install --frozen-lockfile` | both packages recognized |
| Full gate | `pnpm turbo run test bdd lint typecheck build` | exit 0 |
| API | `pnpm --filter api test` | 22/22 PASS |
| Web | `pnpm --filter web test` | 145/145 PASS |
| BDD | `pnpm turbo run bdd` | 43/43 PASS |
| Boundaries | `pnpm lint:fixtures` | exit 0 |

## 9. Acceptance Criteria

R1-R7 file/resolution checks pass; R8-R9 command evidence matches exactly; both barrels export every schema; no importer is rewritten; R10 includes its synchronized Spanish mirror if authored; R11 is present or its omission is justified.

## 10. Out of Scope

No i18n expansion, observability, hardening, coverage-gate enforcement, audit-log UI, OAuth expansion, rate limiting, or migration of the original repository.

## 11. Open Questions — Resolved

- **Q1**: KEEP existing relative/alias imports.
- **Q2**: NO per-package tsconfigs.
- **Q3**: YES, add `src/index.ts` barrels.
- **Q4**: YES, add the small ADR plus Spanish mirror.
- **Q5**: YES, verify workspace declaration; the existing `libs/*/*/*` glob satisfies R4, so edit only if verification disproves coverage.

## 12. Traceability

| Requirement | Goals satisfied |
|---|---|
| R1, R2 | G1 |
| R3 | Barrel API |
| R4 | G2 |
| R5, R6 | G3 |
| R7 | G4 |
| R8 | G5, G7 |
| R9 | G6 |
| R10 | ADR |
| R11 | Package rationale |
