# Delta Spec — `fix-bdd-ci-zod-resolution`

> **Change**: `fix-bdd-ci-zod-resolution` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-bdd-ci-zod-resolution`
> **Mode**: auto · **Artifact store**: hybrid (Engram + OpenSpec) · **Delivery**: single PR (NOT auto-chain)
> **Date**: 2026-07-13
> **Fix shape**: **A'** (compound) — `apps/api/package.json` (move `zod` devDep → dep) + `apps/api/tsconfig.json` (add `paths` mapping for `zod` + 3-line JSDoc comment) + `pnpm-lock.yaml` (auto-regenerated)
> **Single PR**: 2 source files + 1 lockfile regen, **5 net LOC** (well under the 400-line review budget)
> **Proposal**: `openspec/changes/fix-bdd-ci-zod-resolution/proposal.md` (Engram `#2329`)
> **Explore brief**: `openspec/changes/fix-bdd-ci-zod-resolution/explore.md` (Engram `#2328`)

---

## 1. Header

| Field | Value |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-bdd-ci-zod-resolution` (cut from `develop`) |
| Date | 2026-07-13 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Proposal Engram `#2329`; Explore Engram `#2328` |
| Fix shape | A' (compound, per proposal §0 + §3) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | single PR — `auto-chain` NOT triggered (5 net LOC < 400-line review budget) |
| Strict TDD | active (AGENTS.md §4) — config-only fix; no RED-test required (no production code touched; empirical reproducer IS the RED→GREEN evidence per explore §1, §13) |

---

## 2. Intent

The BDD CI gate on `develop` is broken because `apps/api#build` fails with 15 TS2307 errors in a clean Linux container (CI-equivalent) — `apps/api/tsconfig.json` compiles BOTH `apps/api/src/**/*.ts` AND `../libs/features/{auth,transactions}/shared/schemas/**/*.ts` (tsconfig.json:36–40), and 15 of those files `import { z } from "zod"`. With `moduleResolution: "node"` (Node10 — tsconfig.json:5), TypeScript walks ancestors from each compiled file's location looking for `node_modules/zod`. The schema files live in **orphan directories** (`libs/features/{auth,transactions}/shared/` has no `package.json` and no `node_modules/`), so the walk never finds zod and TS2307 fires. Locally the bug is masked because a stale pnpm install on the dev machine created `/Users/sebailla/node_modules/zod` (pollution from a different project); CI's GitHub Actions runner has no such pollution and fails every time. The explorer's empirical reproducer (move HOME pollution aside → clean install → reproduce 15 TS2307 errors → apply Shape A' → verify exit 0) verifies the diagnosis. Shape A' is compound: moving `zod` from `apps/api/devDependencies` to `apps/api/dependencies` closes only the 5 `apps/api/src/` errors; a `paths` mapping in `apps/api/tsconfig.json` is required to close the 10 orphan-schema errors. This spec locks the fix into 6 testable goals: api build passes in clean CI, all 15 errors closed, BDD gate flips FAIL→PASS, BDD scenarios preserved (43/43), apps/web zod 3.x unaffected, and the diff touches only configuration.

---

## 3. Goals

### G1 — `apps/api#build` exits 0 in a clean Linux container

`pnpm --filter api build` MUST exit 0 in a clean Linux container with no HOME pollution (CI-equivalent, no `~/node_modules/zod` masking). `nest build` MUST NOT report any TS2307 errors about zod. The empirical reproducer from explore §13 (move HOME pollution → clean install → build) MUST demonstrate 0 TS2307 errors after the fix.

### G2 — All 15 TS2307 errors are closed

The 15 TS2307 `Cannot find module 'zod'` errors observed in the reproducer MUST all be closed. Specifically: the **5** errors in `apps/api/src/` (`auth.controller.ts:78, :81`, `body.decorator.ts:2`, `query.decorator.ts:2`, `zod-validation.pipe.ts:3`) AND the **10** errors in the orphan schema files (`libs/features/{auth,transactions}/shared/schemas/*.ts`) MUST all resolve to 0 errors.

### G3 — BDD CI gate flips FAIL → PASS

`pnpm turbo run bdd` MUST exit 0 on `feat/fix-bdd-ci-zod-resolution`. The `BDD (Cucumber)` GitHub Actions job that was bypassed in PR #63 (`fix-bdd-tsx-node22`) MUST report `success` on the new PR. The BDD job log MUST show 43/43 scenarios passing (restoring the original gate that was admin-merged-bypass because of this latent zod bug).

### G4 — Zero BDD scenario regression

All **43** BDD scenarios (18 auth + 25 transactions) MUST continue to pass. Zero scenarios MUST be skipped, marked `pending`, marked `todo`, deleted, or otherwise short-circuited by the fix. No step-definition file MUST be modified. No `.feature` file MUST be modified. Schema content (`libs/features/*/shared/schemas/*.ts`) MUST stay byte-identical.

### G5 — `apps/web` zod 3.x usage unaffected

`pnpm --filter web build` MUST continue to exit 0. `apps/web`'s zod 3.24.1 pin (required by `@hookform/resolvers/zod@3.10` Zod-3-only bridge at `apps/web/lib/zod-resolver.ts`) MUST be preserved. The fix MUST NOT bump `apps/web`'s zod 3 dependency, MUST NOT alter `apps/web/package.json`, and MUST NOT shadow `apps/web`'s zod with the apps/api zod 4 resolution.

### G6 — Surgical config-only diff

`git diff develop...feat/fix-bdd-ci-zod-resolution --name-only` MUST touch exactly the 2 source files in scope (`apps/api/package.json`, `apps/api/tsconfig.json`) plus the auto-regenerated `pnpm-lock.yaml`. No file matching `libs/features/.*shared/schemas/.*\.ts$`, no file matching `apps/web/`, no file matching `libs/features/(auth|transactions)/server/package.json`, no `.feature` file, no `.steps.ts` file, no ESLint config / boundary-plugin file, no `.github/workflows/ci.yml`, and no `pnpm-workspace.yaml` MUST be modified.

---

## 4. Non-Goals

The following are explicitly **out of scope** for this change (mirrored from proposal §2.2 + §3.5–§3.7 + AGENTS.md §11):

1. Adding a `package.json` to `libs/features/{auth,transactions}/shared/` (the architecturally correct orphan-directory fix — deferred to a follow-up slice).
2. Setting `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (Shape B — workspace-wide blast radius; rejected per proposal §3.5).
3. Cleaning the HOME pollution at `/Users/sebailla/node_modules/zod` (out of repo scope; documented as future hygiene only).
4. Editing any of the 10 `libs/features/*/shared/schemas/*.ts` schema files (R5).
5. Editing any of the 5 `apps/api/src/` zod consumers (`auth.controller.ts`, `body.decorator.ts`, `query.decorator.ts`, `zod-validation.pipe.ts`).
6. Editing `libs/features/{auth,transactions}/server/package.json` (which already declare zod, including pre-existing duplicate entries — a separate latent issue, deferred).
7. Editing `apps/web/**` (R6; zod 3.24.1 + `@hookform/resolvers/zod@3.10` bridge must continue to work).
8. Adding, removing, or upgrading any dependency (R1 moves zod between dep sections; no version bump, no new package).
9. Adding any new script (`bdd:debug`, `--bail`, etc.).
10. Adding any new ESLint rule, boundary-plugin edit, or `lint:fixtures` fixture.
11. Adding any new test (unit, BDD, or e2e).
12. Editing `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/ci.yml`, or `apps/api/nest-cli.json`.
13. Adding `ADR 0010` (`docs/architecture/decisions/0010-orphan-shared-zod-paths.md`). See §11 Q1.
14. Adding a CI smoke test that strips HOME pollution (`HOME=$(mktemp -d)`). See §11 Q3.
15. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
16. Migrating `gastos-personales/` to the vertical-slicing model.

---

## 5. Functional Requirements

> RFC 2119 keywords. **MUST** = absolute requirement. **SHOULD** = recommended but not blocking. **MAY** = optional.

### R1 — `apps/api/package.json` moves `zod` from `devDependencies` to `dependencies`

The package `apps/api/package.json` MUST move the entry `"zod": "^4.4.3"` from `devDependencies` (currently line 48) into `dependencies` (inserted at the end of the existing deps block, after the `"rxjs": "7.8.1"` entry at line 31). The version string (`"^4.4.3"`) MUST stay byte-identical. No other entry in `apps/api/package.json` MAY change.

### R2 — `apps/api/tsconfig.json` `compilerOptions.paths` adds a `zod` mapping

The `apps/api/tsconfig.json` `compilerOptions.paths` block MUST contain an entry mapping the bare specifier `"zod"` to the pnpm-canonical hoisted location. The mapping value MUST be a **string array** (not a glob) pointing to a real on-disk path under `node_modules/.pnpm/zod@<version>/node_modules/zod`. Concretely the entry MUST read:

```json
"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
```

The mapping MUST be inserted as the **last** entry inside the existing `compilerOptions.paths` block (immediately after `"@shared-utils/*": ["../libs/shared-utils/*"]` at line 32). The relative-path resolution is from `apps/api/tsconfig.json` to the workspace root then into the `.pnpm` content-addressed store. The pnpm-canonical path (`node_modules/.pnpm/zod@<version>/node_modules/zod`) is invariant across pnpm's `public-hoist-pattern` settings.

### R3 — JSDoc-style comment above the `zod` `paths` entry (orphan-directory rationale)

The new `paths` entry from R2 MUST be preceded by a **JSDoc-style comment** (3 or more lines) inside the JSON file, explaining the orphan-directory rationale and pointing to the future follow-up. The comment MUST name: (a) the orphan directory `libs/features/{auth,transactions}/shared/` (no `package.json`), (b) the Node10 ancestor-walk resolution mechanism that fails from that location, and (c) the pnpm-canonical path format being targeted. The comment enables future contributors to understand why the mapping exists without consulting this spec.

### R4 — `pnpm-lock.yaml` regenerated after `package.json` edit

After the R1 edit, the lockfile MUST be regenerated by running `pnpm install`. The resulting `pnpm-lock.yaml` diff MUST be inspected (via `git diff pnpm-lock.yaml`) before commit. The diff MUST be **limited to snapshot-table re-ordering** of the apps/api zod entry (zod moves from the apps/api devDep snapshot to the apps/api runtime snapshot). No other lockfile section MUST change; no other package's snapshot MUST change. If any unexpected change appears in the diff, the apply MUST abort and investigate.

### R5 — No edits to schema files

No file matching `libs/features/{auth,transactions}/shared/schemas/*.ts` MAY be modified. All **10** schema files (5 auth + 5 transactions, listed in explore §2) MUST stay byte-identical.

### R6 — No edits to `apps/web`

No file matching `apps/web/**` MAY be modified. `apps/web/package.json`'s `"zod": "3.24.1"` pin MUST stay byte-identical. `apps/web/lib/zod-resolver.ts` bridge MUST continue to work as-is.

### R7 — No edits to slice server `package.json` files

No file matching `libs/features/{auth,transactions}/server/package.json` MAY be modified. These files already declare zod as a dependency (with pre-existing duplicate entries in both `dependencies` and `devDependencies` — a latent issue deferred to a separate follow-up change). The fix MUST NOT touch them.

### R8 — `pnpm --filter api build` exits 0 in a clean Linux container

`pnpm install --frozen-lockfile && pnpm --filter api build` MUST exit 0 when run inside a clean Linux container (no ambient `~/node_modules/zod` pollution). The empirical reproducer from explore §13 MUST demonstrate this: `mv ~/node_modules /tmp/_backup && pnpm install --frozen-lockfile && cd apps/api && pnpm exec nest build` must report `exit 0` and `0 errors` after the fix is applied.

### R9 — `pnpm turbo run bdd` exits 0

`pnpm turbo run bdd` MUST exit 0 across the workspace on `feat/fix-bdd-ci-zod-resolution`. The 2 BDD-bearing packages (`@features/auth`, `@features/transactions`) MUST each exit 0. The transitively-triggered `api#build` (per `turbo.json` `bdd.dependsOn: ["build"]`) MUST also exit 0 because the fix from R1 + R2 + R3 closes the TS2307 errors that currently block `api#build`.

### R10 — All 43 BDD scenarios continue to pass

All **43** BDD scenarios (18 auth + 25 transactions) MUST pass after the fix. Zero scenarios MUST be skipped, marked pending, marked todo, deleted, or otherwise short-circuited. No `.feature` file, no `.steps.ts` file, no `world.ts`, no `support/register.ts`, no `cucumber.mjs`, and no slice `bdd` script MAY be modified.

### R11 — All 15 TS2307 errors closed

After applying R1 + R2 + R3 + R4, the build MUST report **0** TS2307 errors about zod when run in a clean Linux container. Concretely: the 5 errors in `apps/api/src/` (R5 closure criterion) AND the 10 errors in the orphan schema files (R5 closure criterion) MUST all be resolved. The empirical reproducer from explore §1, §13 MUST demonstrate 0 TS2307 errors.

### R12 — PR description documents the empirical reproducer

The PR description SHOULD lead with a one-paragraph statement citing the empirically-verified local reproducer: "to reproduce, run `mv ~/node_modules /tmp/_backup && pnpm install --frozen-lockfile && cd apps/api && pnpm exec nest build` on develop; observe the 15 TS2307 errors. Apply the fix; rerun the reproducer; observe 0 errors. CI is the same scenario (no HOME pollution)." The reproducer recipe SHOULD be copy-pastable so reviewers can independently verify the diagnosis.

### R13 — PR description flags the orphan-directory follow-up

The PR description SHOULD close with a "Known follow-up" section noting the architecturally correct cleanup: turn `libs/features/{auth,transactions}/shared/` into proper workspace packages (each with its own `package.json`, `tsconfig.lib.json`, and barrel `src/index.ts`). The follow-up SHOULD reference explore brief §16 ("Out of scope" rationale) and explicitly defer it to a separate slice (e.g. `fix-orphan-shared-directories`) so the breadcrumb is preserved.

---

## 6. Scenarios

> Gherkin Given/When/Then. Each scenario MUST be runnable as a shell command or observable from a clean-checkout reproducer. 6 scenarios, one per goal.

### G1 scenario (`apps/api` build clean in CI)

#### Scenario: apps/api build exits 0 in a clean Linux container

- GIVEN `apps/api/package.json` has `zod` in `dependencies` (not `devDependencies`)
- AND `apps/api/tsconfig.json` has a `compilerOptions.paths` mapping for `zod` pointing to `node_modules/.pnpm/zod@4.4.3/node_modules/zod` (bare path; `baseUrl: "../.."` handles the workspace-root anchoring)
- WHEN `pnpm install --frozen-lockfile && pnpm --filter api build` is run in a clean Linux container with no `~/node_modules/zod` pollution
- THEN exit code MUST be 0
- AND no TS2307 errors about zod MUST be reported

### G2 scenario (15 errors closed)

#### Scenario: All 15 TS2307 zod errors are closed

- GIVEN the 10 orphan schema files in `libs/features/*/shared/schemas/` import `zod` on line 1 (`import { z } from "zod";`)
- AND the 5 app files in `apps/api/src/` reference `zod` (4 type-only imports + 1 inline type-only in `auth.controller.ts`)
- WHEN the build runs in a clean Linux container
- THEN 0 TS2307 errors about zod MUST be reported

### G3 scenario (BDD gate flips)

#### Scenario: BDD CI gate goes from fail to pass

- GIVEN the PR is opened with the fix from R1 + R2 + R3 + R4 applied
- WHEN GitHub Actions runs the `BDD (Cucumber)` job on Node 22.13.0 + pnpm 11.10.0
- THEN the job MUST report `success`
- AND 43 of 43 BDD scenarios MUST pass

### G4 scenario (BDD scenarios preserved)

#### Scenario: 43 BDD scenarios continue to pass

- GIVEN the fix from R1 + R2 + R3 + R4 has been applied
- AND no `.feature`, no `.steps.ts`, no `world.ts`, no `support/register.ts`, no `cucumber.mjs`, and no slice `bdd` script has been modified
- WHEN `pnpm turbo run bdd` is run on Node 22.13.0
- THEN 18 auth scenarios + 25 transactions scenarios = **43 total** MUST pass
- AND exit code MUST be 0
- AND 0 scenarios MUST be skipped, pending, todo, or deleted

### G5 scenario (`apps/web` zod 3.x unaffected)

#### Scenario: apps/web's zod 3.x usage continues to work

- GIVEN `apps/web/package.json` pins `zod` to `3.24.1` for `@hookform/resolvers/zod@3.10`
- AND `apps/web/lib/zod-resolver.ts` bridges `@hookform/resolvers/zod` (Zod 3) to apps/web's forms
- WHEN `pnpm --filter web build` is run
- THEN exit code MUST be 0
- AND the zod 3.x resolution MUST be preserved (no accidental upgrade)
- AND `apps/web/package.json` MUST stay byte-identical

### G6 scenario (surgical diff)

#### Scenario: The fix touches only configuration

- GIVEN the diff between `feat/fix-bdd-ci-zod-resolution` and `develop`
- WHEN the file list is filtered by `libs/features/.*shared/schemas/.*\.ts$|apps/web/`
- THEN the filtered list MUST be empty
- AND the filtered list for `libs/features/(auth|transactions)/server/package.json` MUST be empty
- AND the remaining changed files MUST be exactly: `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml`

---

## 7. Constraint Surface

### 7.1 Architectural boundaries (AGENTS.md §7 — enforced by ESLint)

| Rule | Status with fix |
|------|-----------------|
| `no-prisma-outside-core` | Unaffected — no Prisma changes |
| `no-schemas-outside-shared` | Unaffected — schemas stay in `libs/features/*/shared/schemas/` |
| `no-client-server-import` | Unaffected — no client code changes |
| `no-cross-module-import` | Unaffected — no cross-module imports changed |
| `no-mojibake-in-docs` (optional, slice-8) | Unaffected — no `.md` added under `Documents-es/` |
| `no-import-type-injectable` | Unaffected — NestJS DI wiring unchanged |

ESLint fixture check: `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts` contains `import { z } from "zod"`. ESLint (which uses its own Node resolution) resolves zod via `apps/api/node_modules/zod` after R1 moves the dep. **`pnpm lint:fixtures` MUST still report 28 passed, 0 failed** (per the `no-schemas-outside-shared` invariant).

### 7.2 Strict TDD (AGENTS.md §4)

This change is **config-only**. There is no production code to test, so the RED-first step is satisfied vacuously: the empirical reproducer (explore §1, §13) IS the RED→GREEN evidence — moving HOME pollution aside, `pnpm install --frozen-lockfile`, `cd apps/api && pnpm exec nest build` reproduces the 15 TS2307 errors (RED); applying R1 + R2 + R3 + R4 and rerunning the reproducer produces 0 errors (GREEN). The verification commands in §8 ARE the tests. No additional unit test, integration test, or fixture is required.

### 7.3 Atomic commits (AGENTS.md §5) and Conventional Commits (AGENTS.md §6)

- The 2 source edits (R1 + R2 + R3 + R5/6/7 enforcers) plus the R4 lockfile regen MUST land as a **SINGLE atomic commit**. The change is a work unit: "close the orphan-schema zod resolution gap so apps/api#build passes in clean CI."
- Commit message type: `fix(api)` or `fix(build)`. Subject ≤72 chars, imperative, no trailing period. Recommended subject: `fix(api): resolve orphan-schema zod resolution so apps/api#build passes in CI`.
- Body MUST explain WHY (orphan directories in `libs/features/*/shared/` make Node10 ancestor walk fail; `paths` mapping + dependency promotion close the gap), citing the empirical reproducer and the explore brief.
- **No `Co-Authored-By` line. No AI attribution.** (Per AGENTS.md §6 and the persona's hard rule.)
- `git revert <sha>` MUST cleanly reverse the entire PR.

### 7.4 Branch model (AGENTS.md §2)

- Work branch: `feat/fix-bdd-ci-zod-resolution` cut from `develop` (NOT from `main`).
- `main` is immutable; no force-push, no delete, no amend of historic commits.
- PR targets `develop` per `chain_strategy=feature-branch-chain` (single tracker for the entire change, even though there is only one PR — `auto-chain` NOT triggered because the change is below the 400-line review budget).

### 7.5 Single source of truth (AGENTS.md §8)

- The zod dependency declaration lives in exactly one place per package: `apps/api/package.json:dependencies` (after R1). No second config file duplicates it.
- The zod resolution mapping lives in exactly one place: `apps/api/tsconfig.json:compilerOptions.paths` (R2). No build script or wrapper duplicates the path.
- Cross-module zod usage continues to route through `@features/*` workspace packages (slice server packages own zod at runtime); the R2 `paths` mapping is a TypeScript-only construct that does NOT alter runtime resolution.

### 7.6 Spanish mirror (AGENTS.md §13)

- This spec file (`openspec/changes/fix-bdd-ci-zod-resolution/spec.md`) follows the `fix-bdd-tsx-node22` precedent and is **NOT mirrored** at spec-creation time.
- The proposal itself (`openspec/changes/fix-bdd-ci-zod-resolution/proposal.md`) is **NOT mirrored** (mirrors apply to ADRs and design specs, per AGENTS.md §13 + `fix-bdd-tsx-node22` precedent).
- No English `.md` file is added under `docs/architecture/decisions/` by this change (see §11 Q1 — no ADR).
- If the design phase (`sdd-design`) adds any English `.md` under `openspec/` or `docs/`, the apply phase MUST create the matching `Documents-es/openspec/...` or `Documents-es/docs/...` mirror in the same atomic commit.

### 7.7 CI workflow constraints

- BDD job uses Node 22.13.0 + pnpm 11.10.0 + Postgres 16-alpine. Timeout 30 min. The fix MUST work under these exact conditions.
- The fix MUST NOT alter `.github/workflows/ci.yml`.
- The fix MUST work with `pnpm install --frozen-lockfile` (after the initial `pnpm install` regen that updates the lockfile per R4).

### 7.8 Lockfile discipline

- The R4 lockfile regen MUST happen ONCE during the apply task. After the regen, `pnpm install --frozen-lockfile` MUST exit 0 in CI.
- The diff MUST be visually inspected (per AGENTS.md §12) and limited to the apps/api zod snapshot reordering. Any unexpected change aborts the apply.

---

## 8. Test Plan

| Goal | Test command | Expected outcome |
|------|--------------|------------------|
| G1 (`apps/api` build clean) | `mv ~/node_modules /tmp/_backup && pnpm install --frozen-lockfile && cd apps/api && pnpm exec nest build; mv /tmp/_backup ~/node_modules` | exit 0; 0 TS2307 errors |
| G2 (15 errors closed) | `cd apps/api && pnpm exec nest build` in a clean container, then `pnpm exec nest build 2>&1 \| grep "TS2307" \| wc -l` | `0` |
| G3 (BDD gate flips) | GitHub Actions `BDD (Cucumber)` job on the new PR | job reports `success`; 43/43 scenarios |
| G4 (43 scenarios preserved) | `pnpm turbo run bdd` on Node 22.13.0 | exit 0; 18 auth + 25 transactions pass |
| G5 (`apps/web` unaffected) | `pnpm --filter web build` | exit 0; zod 3.24.1 preserved |
| G6 (surgical diff) | `git diff --name-only develop...feat/fix-bdd-ci-zod-resolution` | exactly 3 files: `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml` |

### Manual / non-CI verification steps

- `grep -n "zod" apps/api/package.json` — must show zod in the `dependencies` block (around line 32), NOT in `devDependencies`.
- `grep -n '"zod"' apps/api/tsconfig.json` — must show the `paths` mapping entry with the pnpm-canonical path.
- `git diff pnpm-lock.yaml` — visual inspection must show ONLY apps/api's zod snapshot reordering. No other sections changed.
- `pnpm lint:fixtures` — must still exit 0 (no new boundary violations; 28/28 fixtures pass per explore §9).
- `pnpm turbo run lint typecheck test` — must still exit 0 across all workspaces.
- `bash -n scripts/bdd/verify.sh` (from `fix-bdd-tsx-node22`) — must still pass (syntax check unchanged from predecessor change).

---

## 9. Acceptance Criteria

> Binary pass/fail conditions for `sdd-verify`. Every criterion MUST be testable from a fresh `git checkout feat/fix-bdd-ci-zod-resolution && pnpm install`.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| AC1 | `zod` is in `apps/api/dependencies` | `jq '.dependencies.zod' apps/api/package.json` returns `"^4.4.3"` |
| AC2 | `zod` is NOT in `apps/api/devDependencies` | `jq '.devDependencies.zod // "missing"' apps/api/package.json` returns `"missing"` |
| AC3 | `zod` line in `dependencies` is byte-identical to pre-fix `devDependencies` line | `git log -p -- apps/api/package.json` shows the entry moved verbatim, version unchanged |
| AC4 | `apps/api/tsconfig.json` has `zod` `paths` mapping | `jq '.compilerOptions.paths.zod // "missing"' apps/api/tsconfig.json` returns a 1-element array |
| AC5 | The `zod` mapping points to the pnpm-canonical path | first element equals `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (bare path; no `../../` prefix — see §11 amend below) |
| AC6 | The mapping is a string, not a glob | element starts with `"node_modules/.pnpm/zod@"` (literal string, not a wildcard) |
| AC7 | JSDoc-style comment precedes the mapping | inspect tsconfig source lines: ≥3 consecutive `//` lines naming `libs/features/{auth,transactions}/shared/`, Node10 walk, and pnpm-canonical path, immediately above the `zod` paths key |
| AC8 | `pnpm-lock.yaml` is regenerated | `git diff develop --stat pnpm-lock.yaml` shows non-zero byte changes |
| AC9 | Lockfile diff is limited to apps/api zod snapshot reorder | manual `git diff develop -- pnpm-lock.yaml` review shows only the apps/api zod snapshot relocation; no other sections changed |
| AC10 | Schema files unmodified | `git diff develop --name-only -- 'libs/features/**/shared/schemas/*.ts'` returns empty |
| AC11 | `apps/web/**` unmodified | `git diff develop --name-only -- 'apps/web/**'` returns empty |
| AC12 | `apps/web/package.json` zod pin preserved | `jq '.dependencies.zod' apps/web/package.json` returns `"3.24.1"` |
| AC13 | Slice server `package.json` files unmodified | `git diff develop --name-only -- 'libs/features/auth/server/package.json' 'libs/features/transactions/server/package.json'` returns empty |
| AC14 | `pnpm --filter api build` exits 0 in clean container | run the reproducer from §8 G1: exit code 0, 0 TS2307 errors |
| AC15 | `pnpm --filter web build` exits 0 | `pnpm --filter web build` exits 0; no accidental zod bump |
| AC16 | `pnpm turbo run bdd` exits 0 | on Node 22.13.0, exits 0; 18 auth + 25 transactions scenarios PASS |
| AC17 | Auth BDD exits 0 | `pnpm --filter @features/auth bdd` exits 0; 18/18 scenarios |
| AC18 | Transactions BDD exits 0 | `pnpm --filter @features/transactions bdd` exits 0; 25/25 scenarios |
| AC19 | 0 BDD scenarios skipped/pending/todo | BDD log shows 43 executed, 0 skipped, 0 pending, 0 todo |
| AC20 | All quality gates from AGENTS.md §3 pass | `pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test && pnpm lint:fixtures && pnpm turbo run bdd e2e` exits 0 |
| AC21 | CI BDD job reports success | GitHub Actions `BDD (Cucumber)` job on the PR reports `success` |
| AC22 | Diff is exactly the 3 expected files | `git diff develop --name-only` lists exactly: `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml` |
| AC23 | ESLint boundary fixtures unchanged | `pnpm lint:fixtures` reports the same fixture pass count as on develop (±0) |
| AC24 | `.github/workflows/ci.yml` unmodified | `git diff develop --name-only -- .github/workflows/ci.yml` returns empty |
| AC25 | `pnpm-workspace.yaml` unmodified | `git diff develop --name-only -- pnpm-workspace.yaml` returns empty |
| AC26 | `tsconfig.base.json` unmodified | `git diff develop --name-only -- tsconfig.base.json` returns empty |
| AC27 | No `Co-Authored-By` in commit | `git log feat/fix-bdd-ci-zod-resolution --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC28 | Single atomic commit | `git log --oneline develop..feat/fix-bdd-ci-zod-resolution` shows exactly 1 commit |
| AC29 | Conventional Commit subject format | `git log -1 --pretty=%s` matches `^fix\([a-z-]+\): .+` and is ≤72 chars |
| AC30 | No `.feature`, `.steps.ts`, `cucumber.mjs`, or `support/register.ts` modified | `git diff develop --name-only -- '*.feature' '*.steps.ts' 'cucumber.mjs' 'support/register.ts' 'world.ts'` returns empty |

---

## 10. Out of Scope

(Mirrored from proposal §2.2 + §3.5–§3.7 + AGENTS.md §11; non-goals above are operational, this section is the formal review check.)

1. Anything in AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
2. Adding a `package.json` to `libs/features/{auth,transactions}/shared/` (architectural orphan-directory fix — **deferred to a future `fix-orphan-shared-directories` change**; see proposal §10 Q5 + §11 Q4 follow-up). This is the recommended future work; documenting it here so it is not forgotten.
3. Setting `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (proposal Shape B — rejected for v1 per proposal §3.5).
4. Cleaning the HOME pollution at `/Users/sebailla/node_modules/zod` (out of repo scope; documented as future hygiene only).
5. Editing any `.ts` source file (schema files, app files, support code, step-defs).
6. Editing any `.feature` file or `cucumber.mjs`.
7. Editing `apps/web/**` (zod 3.24.1 + `@hookform/resolvers/zod@3.10` bridge must continue to work).
8. Editing `libs/features/{auth,transactions}/server/package.json` (these have pre-existing duplicate zod declarations — **a separate latent issue, deferred**).
9. Editing `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/api/nest-cli.json`, `.github/workflows/ci.yml`.
10. Pinning or upgrading any dependency.
11. Adding any new dev dependency, build script, ESLint rule, or boundary-plugin fixture.
12. Adding any new unit test, BDD scenario, or e2e test.
13. Writing `ADR 0010` (`docs/architecture/decisions/0010-orphan-shared-zod-paths.md`). See §11 Q1.
14. Adding a CI smoke test that strips HOME pollution (`HOME=$(mktemp -d)`). See §11 Q3.
15. Anything from the predecessor's `fix-bdd-tsx-node22` change (loader hook token; that change is closed and unrelated to this fix).
16. Migrating `gastos-personales/` to the vertical-slicing model.

---

## 11. Open Questions — RESOLVED

The proposal deferred 5 questions to the spec phase. They are now resolved:

### Q1 — ADR 0010 for the orphan-schema + paths-mapping decision

**Resolved**: **NO ADR.**

Rationale: the change is 5 LOC of build-config (2 source files + 1 lockfile regen). An ADR for a config tweak of this size is bureaucratic overhead. The **3-line JSDoc comment in `apps/api/tsconfig.json`** (R3) is a better fit for the size: it lives directly above the `paths` mapping it documents, names the root cause (orphan `libs/features/{auth,transactions}/shared/` directory + Node10 ancestor walk), and points future contributors to explore brief and this spec for context. The R12 PR description requirement carries the full repro recipe, so a separate `docs/architecture/decisions/0010-*.md` would only restate what's already in the file header. This precedent (config-only fix → inline comment, no ADR) matches the `fix-bdd-tsx-node22` precedent for analogous build-config fixes.

### Q2 — JSDoc comment in `tsconfig.json`

**Resolved**: **YES** — R3 mandates a 3+ line JSDoc-style comment above the `zod` `paths` entry.

Rationale: without the comment, future contributors will see a single-line `paths` entry pointing to a weird `node_modules/.pnpm/zod@<version>/...` location and wonder (a) why this mapping exists when there's no obvious purpose, (b) whether it's safe to delete, and (c) whether the hard-coded zod version (`4.4.3`) needs to be kept in sync with `apps/api/package.json`. A 3-line comment explains all three: "this mapping closes the orphan-schema resolution gap; `libs/features/{auth,transactions}/shared/` has no `package.json`, so Node10 ancestor-walk cannot reach zod; this mapping intercepts ALL files compiled by `apps/api`'s tsc (including the orphan schemas)". The hard-coded version concern is documented in proposal §7 R1 (low likelihood + the mitigation is the JSDoc comment).

### Q3 — CI smoke test for HOME pollution

**Resolved**: **NO CI smoke test.**

Rationale: scope creep. CI's GitHub Actions runner is already a clean Linux container (per explore §7) with no `~/node_modules/zod` pollution — the bug reproduces naturally there. The belt-and-suspenders smoke test (`HOME=$(mktemp -d)`) would add CI runtime + complexity for zero actual coverage gain. The R8 reproducer in the PR description (R12) is sufficient for future regression detection: any contributor who reintroduces the orphan-schema gap will see `pnpm install --frozen-lockfile && pnpm --filter api build` fail with the original TS2307 errors in their feature branch.

### Q4 — `openspec/specs/` capability creation

**Resolved**: **NO new capability file.**

Rationale: per proposal §4.1, the proposal claims no spec-level behaviour change. This fix is a build-system mechanics correction — the 43 BDD scenarios, slice server packages, schema content, app source code, step definitions, world types, Gherkin `.feature` files, Cucumber configs, and `support/register.ts` files all stay byte-identical. The capabilities (`auth`, `transactions`, `api-runtime`, `web-runtime`) are unchanged. Creating `openspec/specs/apps-api-build-resolution/spec.md` at this point would invent a capability name (`apps-api-build-resolution`) preemptively, with no behavioural contract attached. The fix is documented in this delta spec, the proposal, the explore brief, and (via the JSDoc comment + PR description) inline in the source.

### Q5 — Follow-up slice proposal for orphan-directory cleanup

**Resolved**: **YES — deferred to a separate `fix-orphan-shared-directories` change.**

Rationale: the architecturally correct cleanup (turn `libs/features/{auth,transactions}/shared/` into proper workspace packages) is real but out of scope here. It would require each `shared/` directory to grow a `package.json` + `tsconfig.lib.json` + barrel `src/index.ts`, plus import-path updates in every consumer (`apps/api`, `apps/web`, `libs/features/{auth,transactions}/server/src/**`). At minimum a 5–10 PR change with its own design surface. Documented as a known follow-up in R13 (PR description "Known follow-up" section). When slice-9 starts (or whenever capacity allows), a separate `fix-orphan-shared-directories` change folder can be opened. Until then, the JSDoc comment (R3) is the breadcrumb that surfaces this gap to anyone editing the `paths` mapping.

### Q6 — Design §8 Q1 spec↔design reconciliation (amended at apply time)

**Amendment (2026-07-14, apply phase)**: the `paths` mapping value in R2, AC5, AC6, and the G1.1 Gherkin GIVEN clause above was corrected from `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` to `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (drop `../../`). Root cause: `apps/api/tsconfig.json:10` already sets `"baseUrl": "../.."`, so `paths` entries resolve relative to `baseUrl` (workspace root), not the tsconfig file. The `../../`-prefixed value resolved to `<workspace-parent>/node_modules/.pnpm/...` (one level ABOVE the workspace root) and does not exist on this filesystem. Verified empirically via `path.resolve("../..", "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod")` → `false` vs `path.resolve("../..", "node_modules/.pnpm/zod@4.4.3/node_modules/zod")` → `true`. The TypeScript compiler's `--traceResolution` log confirms every orphan-schema file (10 files across `libs/features/{auth,transactions}/shared/schemas/`) now resolves `zod` to `<workspace-root>/node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.d.cts`. The fix in `apps/api/tsconfig.json` uses the correct bare path; this spec is amended to match. See design.md §8 Q1 for the full rationale.

---

## 12. Traceability

Goal → Requirement → Scenario → Acceptance Criterion:

| Goal | Requirements | Scenarios | Test command (or AC) |
|------|-------------|-----------|----------------------|
| G1 (`apps/api` clean CI build) | R1, R2, R3, R8 | G1.1 | AC14; reproducer recipe |
| G2 (15 errors closed) | R1, R2, R11 | G2.1 | AC14 |
| G3 (BDD gate flips) | R1, R2, R9 | G3.1 | AC21 |
| G4 (BDD scenarios preserved) | R1, R2, R10 | G4.1 | AC16, AC17, AC18, AC19, AC30 |
| G5 (`apps/web` zod 3.x) | R6 | G5.1 | AC11, AC12, AC15 |
| G6 (surgical diff) | R4, R5, R6, R7 | G6.1 | AC10, AC11, AC13, AC22, AC24, AC25, AC26, AC30 |

### Requirement ↔ Acceptance Criterion matrix

| Requirement | Acceptance criteria |
|-------------|---------------------|
| R1 | AC1, AC2, AC3 |
| R2 | AC4, AC5, AC6 |
| R3 | AC7 |
| R4 | AC8, AC9 |
| R5 | AC10 |
| R6 | AC11, AC12, AC15 |
| R7 | AC13 |
| R8 | AC14 |
| R9 | AC16, AC17, AC18, AC21 |
| R10 | AC16, AC17, AC18, AC19, AC30 |
| R11 | AC14 (0 TS2307 errors after the reproducer exit 0) |
| R12 | (PR description convention; not gated by AC — visible in the PR body at review time) |
| R13 | (PR description convention; not gated by AC — visible in the PR body at review time) |

### Risk ↔ requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (hard-coded zod version in `paths` mapping — version-bump maintenance hazard) | R3 (JSDoc comment names the pnpm-canonical path format and flags the version); proposal §7 R1 plan acknowledges future slice-8 maintenance task |
| R2 (lockfile regen surfaces unexpected drift) | R4 (diff must be inspected; abort and investigate if anything else moves) |
| R3 (apps/web zod 3.24.1 may conflict with apps/api zod 4.4.3) | R6 + G5.1 + AC11/AC12/AC15 (apps/web untouched; zod 3 pin byte-identical) |
| R4 (orphan directories papered over, future contributors hit same gap) | R3 (JSDoc names the root cause); R13 (PR description flags the `fix-orphan-shared-directories` follow-up); §11 Q5 (deferred change planned) |
| R5 (future pnpm major changes `.pnpm/<name>@<version>/node_modules/<name>` path format) | R2 (target is pnpm-canonical; invariant since pnpm 6); R3 (comment flags the path format) |
| R6 (duplicate zod declarations in slice server `package.json` confuse reviewers) | R7 (those files NOT touched); AC13 (`git diff` proves they are empty); R13 (PR description notes pre-existing duplicates are deferred) |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-bdd-ci-zod-resolution/proposal.md` (Engram `#2329`)
- **Explore brief**: `openspec/changes/fix-bdd-ci-zod-resolution/explore.md` (Engram `#2328`)
- **Smoking-gun error**: 15× `error TS2307: Cannot find module 'zod' or its corresponding type declarations.` (5 in `apps/api/src/`, 10 in `libs/features/*/shared/schemas/*.ts`)
- **Loading-config references**:
  - `apps/api/tsconfig.json:5` — `moduleResolution: "node"` (Node10 classic)
  - `apps/api/tsconfig.json:36–40` — `include` glob covers BOTH `apps/api/src/` AND `libs/features/*/shared/schemas/` (source of orphan-schema resolution failure)
  - `apps/api/package.json:48` — pre-fix `zod` devDep declaration (moves per R1)
- **Lockfile state**:
  - `zod@4.4.3` declared by `apps/api` (devDep→dep per R1), `libs/core/config`, `libs/core/events`, `libs/features/auth/server`, `libs/features/transactions/server`
  - `zod@3.24.1` declared by `apps/web` (unchanged per R6)
- **Empirical reproducer** (from explore §13):
  ```bash
  mv ~/node_modules /tmp/_backup_node_modules_$$
  cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
  rm -rf node_modules apps/*/node_modules libs/*/*/node_modules libs/*/*/*/node_modules
  pnpm install --frozen-lockfile
  cd apps/api && pnpm exec nest build 2>&1 | grep "TS2307"
  # Expected on develop (RED): 15 errors
  # Expected after fix (GREEN): 0 errors
  mv /tmp/_backup_node_modules_$$ ~/node_modules
  ```
- **Schema files** (untouched by R5): all 10 in `libs/features/{auth,transactions}/shared/schemas/*.ts` (5 auth + 5 transactions — explore §2)
- **apps/api/src zod consumers** (untouched by R5): `auth.controller.ts:78, :81`; `body.decorator.ts:2`; `query.decorator.ts:2`; `zod-validation.pipe.ts:3`
- **Slice server `package.json` files** (untouched by R7): `libs/features/{auth,transactions}/server/package.json`
- **ESLint boundary fixtures** (untouched): `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts`
- **CI workflow** (untouched per AC24): `.github/workflows/ci.yml` `BDD (Cucumber)` job uses Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout
- **Predecessor**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/spec.md` (mirrored this 12-section structure; same author, same hybrid artifact store, same single-PR shape for analogous surgical config fix; Engram `#2307`)
- **Project conventions**: AGENTS.md §2 (branch — develop → tracker `feat/fix-bdd-ci-zod-resolution`), §3 (quality gates — all six must pass), §4 (strict TDD — config-only fix, no RED test needed because no production code is touched), §5 (atomic commits — single work-unit commit touching 2 source files + lockfile), §6 (Conventional Commits — `fix(api): resolve orphan-schema zod resolution so apps/api#build passes in CI`), §7 (boundary plugin — no rule, fixture, config, or runner edits), §11 (out-of-scope — none of its items touched), §12 (pre-commit checklist — single-purpose commit, rollback-trivial, ESLint unchanged), §13 (Spanish mirror — none required, no `.md` added under `openspec/` or `docs/` beyond the proposal itself)

---

**Next phase**: `design` (`sdd-design` will produce the exact diff hunks for the `apps/api/package.json` move, the `apps/api/tsconfig.json` `paths` mapping + JSDoc comment, and the `pnpm install` lockfile-regen command sequence — translating this WHAT into HOW).
