# Delta Spec — `fix-vitest-4-deprecation`

> **Project**: `gastos-personales-reference` (`gp-v2`) · **Date**: 2026-07-14
> **Mode**: `auto` · **Store**: hybrid · **Strict TDD**: ACTIVE (AGENTS.md §4 exception: pure config files do not require tests but MUST keep the pipeline green)
> **Shape**: A · **Delivery**: single PR; `auto-chain` not triggered (1 file, ~10 LOC)
> **Sources**: proposal Engram `#2396`; explore Engram `#2394`

## 1. Header

Status: draft · spec phase. The change migrates `apps/web/vitest.config.ts` away from the Vitest 4-removed `poolOptions: { forks: { singleFork: true } }` pattern to the upstream-blessed top-level `pool: "forks"`, `maxWorkers: 1`, `isolate: false` replacement. Preserves the slice-7 PR-7 single-fork semantics that dodge the happy-dom 20.10 + vitest 4.1 worker-pool instability (otherwise the 25-test state-coverage harness regresses).

## 2. Intent

Eliminate the `DEPRECATED test.poolOptions was removed in Vitest 4...` warning emitted on every `pnpm --filter web test` run, while preserving the slice-7 PR-7 serialized-fork test runtime that the apps/web suite depends on.

## 3. Goals

- **G1**: `apps/web/vitest.config.ts` defines `test` config with top-level `pool: "forks"`, `maxWorkers: 1`, `isolate: false`; the `poolOptions` key is absent.
- **G2**: The accompanying `@ts-expect-error` directive above the deprecated block is removed.
- **G3**: `pnpm --filter web test` produces NO `DEPRECATED test.poolOptions` warning on stderr.
- **G4**: 145/145 apps/web tests continue to PASS.
- **G5**: 25/25 state-coverage scenarios continue to PASS (slice-7 PR-7 repro; no OOM re-introduction).
- **G6**: 22/22 apps/api tests and 43/43 BDD scenarios continue to PASS.
- **G7**: `pnpm turbo run lint typecheck` exits 0 (no eslint/tsc regression).

## 4. Non-Goals

No vitest version bump (stays pinned at `4.1.9`); no migration of the other 9 `vitest.config.*` files (none use `poolOptions`); no test-file / component / BDD / ESLint / CI / Turbo / workspace changes; no slice-7 history edits; no new tests (AGENTS.md §4 exception covers this pure config change); no coverage gate; no ADR (1-file config change with link to the official migration guide).

## 5. Functional Requirements

- **R1 (MUST)**: `apps/web/vitest.config.ts` MUST export a `defineConfig` whose top-level `test` object includes `pool: "forks"` as a top-level property.
- **R2 (MUST)**: The same `test` object MUST include `maxWorkers: 1` as a top-level property, replacing the deprecated `poolOptions.forks.singleFork: true`.
- **R3 (MUST)**: The same `test` object MUST include `isolate: false` as a top-level property. Migration guide requires both `maxWorkers: 1` and `isolate: false` together to replicate the old `singleFork: true` behavior.
- **R4 (MUST)**: The same `test` object MUST NOT contain any `poolOptions` key (including an empty `poolOptions: {}` leftover). The whole nested block MUST be removed.
- **R5 (MUST)**: The same `test` object MUST NOT contain any `// @ts-expect-error` directive above the removed block (no upstream type error to suppress anymore).
- **R6 (MUST)**: A 1-line JSDoc-style comment MUST accompany the new top-level config, citing slice-7 PR-7 as the rationale and warning future maintainers not to drop `maxWorkers: 1` without re-reading that slice.
- **R7 (MUST)**: No other `vitest.config.*` file under `apps/`, `libs/`, or `tools/` is modified.
- **R8 (MUST)**: `pnpm --filter web test` output MUST NOT contain the substring `DEPRECATED test.poolOptions` in stdout or stderr.
- **R9 (MUST)**: `pnpm --filter web test` MUST report 145 of 145 tests passing; `pnpm --filter api test` MUST report 22 of 22; `pnpm turbo run bdd` MUST report 43 of 43 scenarios passing.
- **R10 (MUST)**: `pnpm turbo run lint typecheck` MUST exit 0.
- **R11 (MUST)**: The vitest version in `apps/web/package.json` and `pnpm-lock.yaml` MUST remain `4.1.9` (no version bump).
- **R12 (SHOULD)**: The PR description SHOULD explicitly reference the Vitest 4 migration guide URL (`https://vitest.dev/guide/migration#pool-rework`) as the authoritative source for the migration mapping.
- **R13 (SHOULD)**: The new top-level config SHOULD preserve the slice-7 PR-7 single-fork semantics: 1 worker, no isolation between test files in the same fork — functionally equivalent to `poolOptions.forks.singleFork: true`.

## 6. Scenarios

```gherkin
Scenario: apps/web vitest config uses top-level pool + maxWorkers + isolate
  Given `apps/web/vitest.config.ts` previously had `poolOptions: { forks: { singleFork: true } }`
  When the fix is applied
  Then the file MUST have `pool: "forks"` at the top level of the `test` object
  And it MUST have `maxWorkers: 1` at the top level
  And it MUST have `isolate: false` at the top level
  And it MUST NOT have a `poolOptions` key (including `poolOptions: {}`)
  And it MUST NOT have a `// @ts-expect-error` directive above the removed block

Scenario: vitest produces no poolOptions deprecation warning
  Given the fix has been applied
  When `pnpm --filter web test` runs
  Then the test output MUST NOT contain the string "DEPRECATED test.poolOptions"
  And no other deprecation warning tied to test.poolOptions MUST appear

Scenario: 145 apps/web tests continue to pass
  Given the fix has been applied
  When `pnpm --filter web test` runs
  Then 145 of 145 tests MUST pass
  And the test duration MUST remain similar to before (~1.5s)

Scenario: 22 apps/api tests + 43 BDD scenarios continue to pass
  Given the fix has been applied
  When `pnpm --filter api test` runs
  Then 22 of 22 apps/api tests MUST pass
  And `pnpm turbo run bdd` runs → 43 of 43 BDD scenarios MUST pass

Scenario: slice-7 PR-7 workaround semantics preserved
  Given the fix has been applied
  When `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` runs
  Then 25 of 25 scenarios MUST pass (no OOM re-introduction)
  And the suite MUST finish in similar time to the pre-fix baseline

Scenario: Only apps/web vitest config is modified
  Given the diff between the PR branch and develop
  When the file list is filtered by `vitest.config.*$`
  Then the filtered list MUST contain exactly 1 file (apps/web/vitest.config.ts)
  And no other workspace config (apps/api, libs/*, tools/*) is touched

Scenario: vitest version stays at 4.1.9
  Given the fix has been applied
  When `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json` runs
  Then the vitest version MUST remain 4.1.9 (no version bump)
```

## 7. Constraint Surface

Only `apps/web/vitest.config.ts` is touched. The 9 other `vitest.config.*` files (`apps/api`, `libs/shared-utils/*`, `libs/core/*`, `libs/features/*/vitest.config.*`) do not use `poolOptions` (verified by repo-wide grep — only `apps/web/vitest.config.ts` matches) and MUST stay untouched. No code change in `apps/web/components/`, `apps/web/__tests__/**`, `libs/features/**`, BDD step definitions, ESLint boundary plugin, or `tools/eslint-plugin-boundary/`. The ESLint boundary rule `no-prisma-outside-core` and the deprecated `poolOptions` warning gate are orthogonal to each other. AGENTS.md §4 (Strict TDD) exception clause applies: pure config files do not require tests but MUST keep the pipeline green; verification is via the existing test suite staying green plus the deprecation warning disappearing. AGENTS.md §6 (Conventional Commits): subject ≤72 chars, `chore(scope): subject` form, no `Co-Authored-By`. AGENTS.md §5 (Atomic commits): single commit, `git revert` reversible. The vitest version is pinned via `pnpm-workspace.yaml`; install is deterministic. Refs: Vitest 4 migration guide section "Pool rework" — `https://vitest.dev/guide/migration#pool-rework`.

## 8. Test Plan

| Coverage | Command | Expected |
|---|---|---|
| Deprecation gone | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` | empty output |
| Web full suite | `pnpm --filter web test` | 145/145 PASS, ~1.5s |
| Slice-7 repro | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | 25/25 PASS |
| API | `pnpm --filter api test` | 22/22 PASS |
| BDD | `pnpm turbo run bdd` | 43/43 PASS |
| Lint + typecheck | `pnpm turbo run lint typecheck` | exit 0 |
| Boundaries | `pnpm lint:fixtures` | exit 0 |
| Scope discipline | `git diff origin/develop..HEAD --name-only \| grep -E 'vitest\.config.*$'` | exactly one file: `apps/web/vitest.config.ts` |
| Version unchanged | `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` | empty (no version line) |
| Full gate | `pnpm turbo run build lint typecheck test` | exit 0 across all workspaces |

## 9. Acceptance Criteria

R1-R6 config-shape checks pass via direct AST/grep verification of `apps/web/vitest.config.ts`. R7 verified by the file-list filter showing exactly one modified config file. R8 verified by grepping the test output for the exact `DEPRECATED test.poolOptions` substring. R9 verified by running the three test gates and asserting the documented counts. R10 verified by `pnpm turbo run lint typecheck` exit code. R11 verified by `git diff` over `package.json` / `pnpm-lock.yaml` showing no version bump. R12 verified by PR-description text inspection during PR creation. R13 verified implicitly by R8 + R9 (slice-7 semantics preserved if 25/25 + 145/145 + 0 warnings are observed).

## 10. Out of Scope

No i18n expansion beyond `en`+`es`; no Sentry / error-reporting SaaS; no API edge rate-limiting; no additional OAuth providers beyond Google; no production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config); no observability (OpenTelemetry, Prometheus, log shipping); no coverage-gate enforcement at CI; no migration of `gastos-personales/` to the vertical-slicing model; no audit-log UI; no vitest version bump; no migration of other 9 `vitest.config.*` files; no test-file / component / BDD / ESLint / CI / Turbo / workspace edits; no slice-7 history edits; no new tests; no ADR.

## 11. Open Questions — Resolved

- **Q1**: Add JSDoc comment explaining workaround? **YES** — 1-line comment citing slice-7 PR-7 as the rationale, so future maintainers don't drop `maxWorkers: 1` without re-reading that slice. R6 enforces.
- **Q2**: Migrate other test configs for symmetry? **NO** — only `apps/web/vitest.config.ts` uses the deprecated `poolOptions` pattern (verified by repo-wide grep); the other 9 configs are out of scope. R7 enforces.
- **Q3**: Add vitest config unit test asserting canonical shape? **NO** — AGENTS.md §4 exception covers this pure config change; verification is via the existing test suite staying green + deprecation warning disappearing.
- **Q4**: Open an ADR? **NO** — 1-file config change linking to the official migration guide (R12) is the documentation surface.

## 12. Traceability

| Spec requirement | Goals satisfied |
|---|---|
| R1, R2, R3, R4, R5 | G1, G2 |
| R6 | (JSDoc rationale) |
| R7 | (scope discipline) |
| R8 | G3 |
| R9 | G4, G5, G6 |
| R10 | G7 |
| R11 | (no version bump) |
| R12 | (PR description references migration guide) |
| R13 | G5 (slice-7 PR-7 semantics preserved) |

---

## Relevant Files

- `apps/web/vitest.config.ts` — only file affected.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — slice-7 PR-7 repro evidence (25/25 PASS pre- and post-fix).
- `openspec/changes/fix-vitest-4-deprecation/proposal.md` — Shape A rationale and rejection of Shapes B/C/D.
- `openspec/changes/fix-coverage-minor-subfailures/explore.md` — root-cause evidence + migration-guide mapping.
- Engram `#2396` — proposal; Engram `#2394` — explore brief; Engram `#2380` — post-PR-#67 truth (145/145 + 43/43 green).
