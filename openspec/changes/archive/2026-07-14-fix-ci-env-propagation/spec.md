# Delta Spec — `fix-ci-env-propagation`

> **Change**: `fix-ci-env-propagation` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-ci-env-propagation`
> **Mode**: auto · **Artifact store**: hybrid (Engram + OpenSpec) · **Delivery**: single PR (NOT auto-chain)
> **Date**: 2026-07-14
> **Fix shape**: **A** — `turbo.json` env declaration. 2 `env` arrays (~14 LOC, 7 vars × 2 tasks) + 2-line JSDoc-style breadcrumb.
> **Single PR**: 1 file in scope, 14 net LOC (well under the 400-line review budget)
> **Proposal**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
> **Explore brief**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`)

---

## 1. Header

| Field | Value |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-ci-env-propagation` (cut from `develop`) |
| Date | 2026-07-14 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Proposal Engram `#2343`; Explore Engram `#2340` |
| Fix shape | A (per proposal §0 + §3) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | single PR — `auto-chain` NOT triggered (14 net LOC < 400-line review budget) |
| Strict TDD | active (AGENTS.md §4) — config-only fix; no RED-test required (no production code touched; the explore brief's Tests 1–5 ARE the empirical RED→GREEN evidence per explore §4) |

---

## 2. Intent

The BDD CI gate on `develop` is broken — not because of any code defect, but because Turborepo 2.10.3 runs in default `strict` env mode and **strips every env var that is not declared in `turbo.json`** before launching child tasks. The BDD job's GitHub Actions `env:` block (`.github/workflows/ci.yml:214-221`) declares 7 vars (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`) and forwards them into the runner's shell, but `turbo.json`'s `build` task (line 5-8) and `bdd` task (line 25-28) declare NO `env` / `passThroughEnv` / `globalEnv` / `globalPassThroughEnv`. So when `pnpm turbo run bdd` schedules `web#build` transitively via `dependsOn: ["build"]`, Turbo strips all 7 vars from `web#build`'s process environment, and `@core/config`'s eager `parseEnv(process.env)` at module load (`libs/core/config/env.ts:89`) throws on the 5 required string fields. Next.js workers are NOT the source — direct `next build` with the same CI env succeeds (explore §4 Test 2 + Test 5). The fix declares all 7 vars in `turbo.json` using the **`env` field** (NOT `passThroughEnv`) on both the `build` and `bdd` tasks so the chain propagates them to `web#build` and the eager Zod validation receives the contract. 4 PRs have been admin-merged with BDD gate bypassed since PR #61 (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) because of this latent bug; this fix unblocks the BDD gate permanently for the next green cycle. This spec locks the fix into 6 testable goals: BDD CI passes for the first time since PR #61, all 4 CI jobs green, all 43 BDD scenarios preserved, local dev behaviour unchanged, cache invalidation works when env vars change, and the diff is surgical (1 file, no source code touched).

---

## 3. Goals

### G1 — BDD (Cucumber) CI job passes for the first time since PR #61

`pnpm turbo run bdd` MUST exit 0 in CI. The `BDD (Cucumber)` GitHub Actions job MUST report `success` on `feat/fix-ci-env-propagation` for the first time since PR #61 merged the env-rich BDD job config. The job log MUST show 43/43 BDD scenarios passing (18 auth + 25 transactions = 43 total).

### G2 — All 4 CI jobs green (Static analysis, Build, Unit + integration, BDD)

All 4 CI jobs from `.github/workflows/ci.yml` MUST report `success` on the new PR: **Static analysis**, **Build**, **Unit + integration**, **BDD (Cucumber)**. This is the slice-7/8 "all 4 green" contract that the predecessor fixes (`fix-bdd-tsx-node22`, `fix-bdd-ci-zod-resolution`) tried to land and admin-merged with the BDD gate bypassed. The Build job currently has `continue-on-error: true` (pre-existing, out of scope); its step outcome is independent of the G1 BDD-green signal that proves the underlying fix.

### G3 — All 43 BDD scenarios continue to pass locally and in CI

The 43 BDD scenarios (18 auth across 6 feature files + 25 transactions across 6 feature files = 43 total; 239 total steps: 101 auth + 138 transactions) MUST continue to pass both locally (`pnpm turbo run bdd` on the developer's machine with `apps/web/.env.test`) AND in CI (`.github/workflows/ci.yml` BDD job with the 7 declared env vars). Zero scenarios MUST be skipped, marked `pending`, marked `todo`, deleted, or otherwise short-circuited by the fix.

### G4 — Local dev behaviour is unchanged

`pnpm turbo run build` run locally with the standard local env (`apps/web/.env.test` supplying the 7 vars) MUST produce an exit code identical to the pre-fix baseline: 0. Direct `next build` (bypassing Turbo) with the same env MUST continue to succeed. The fix MUST NOT alter any observable product behaviour; it only fixes how Turbo propagates env vars from its parent shell to the `build` / `bdd` task processes.

### G5 — Cache invalidation works when env vars change

The Turbo cache MUST invalidate correctly when any of the 7 declared env vars changes. Concretely: after `pnpm turbo run build` populates the cache with `DATABASE_URL=<A>`, rerunning `pnpm turbo run build` (without `--force`) with `DATABASE_URL=<B>` MUST be a cache miss for affected packages (Turbo re-runs `web#build` because the env var participates in the cache hash). This guarantees that build outputs that embed env-derived values (e.g., Next.js page-data bundles that include `API_URL`) are never served from a stale cache.

### G6 — The diff touches only `turbo.json`

`git diff develop...feat/fix-ci-env-propagation --name-only` MUST touch exactly 1 source file: `turbo.json`. No `.ts` / `.tsx` source file, no `.feature` file, no `.steps.ts` file, no `cucumber.mjs`, no `support/register.ts`, no `world.ts`, no `.env*` file, no `apps/api/**`, no `apps/web/**`, no `libs/**`, no `tools/eslint-plugin-boundary/**`, no `.github/workflows/ci.yml`, no `pnpm-lock.yaml`, no `package.json`, no `tsconfig*.json` MUST be modified.

---

## 4. Non-Goals

The following are explicitly **out of scope** for this change (mirrored from proposal §2.2 + AGENTS.md §11 + explore brief §5):

1. Lazy-validating `@core/config` so that missing required fields don't throw at module load (proposal Shape B; explore brief §5 Shape A; ~30-50 LOC + tests; changes fail-fast semantics; deferred to a separate architectural change).
2. Adding `passThroughEnv` instead of `env` (proposal Shape D; rejected — cache-incorrect; build outputs embed env-derived values and cache hashes must include them).
3. Declaring `globalEnv` or `globalPassThroughEnv` at the top level of `turbo.json` so the env vars reach `lint` / `test` / `typecheck` / `e2e` / `dev` tasks too (rejected — bloats those tasks' cache hashes with vars they don't consume; per-proposal §10 Q2 resolution = per-task).
4. Editing `.github/workflows/ci.yml` (the BDD job's env block at lines 214-221 is correct; the contract violation is in the Turbo task definition, not in CI).
5. Editing `libs/core/config/env.ts`, `env.schema.ts`, or `index.ts` (eager validation stays as-is; it exposed a real task-contract bug and should stay eager).
6. Editing `apps/web/.env.test`, `apps/web/.env.example`, or any `.env*` file (env vars come from the BDD job's CI env block; locally `apps/web/.env.test` already provides them).
7. Adding a `package.json` to `libs/features/{auth,transactions}/shared/` (the orphan-directory architectural fix from `fix-bdd-ci-zod-resolution` §11 Q5; deferred to a separate `fix-orphan-shared-directories` change).
8. Setting `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (rejected — workspace-wide blast radius).
9. Editing `apps/web/auth.ts` or any `apps/web/app/[locale]/**/*.tsx` RSC page.
10. Editing `apps/api/**` (controllers, services, Prisma schema, `nest-cli.json`).
11. Adding a new ESLint rule, editing `tools/eslint-plugin-boundary/**`, or adding/modifying a fixture under `__fixtures__/`.
12. Adding a new dev dependency, runtime dependency, version bump, or `pnpm install` of any kind. The lockfile MUST stay byte-identical.
13. Adding a new BDD scenario, unit test, integration test, or e2e test.
14. Adding a CI smoke test that strips HOME pollution (`HOME=$(mktemp -d)`) or any other new CI step.
15. Adding `continue-on-error: false` to the Build job's `web#build` step (pre-existing governance issue from `fix-bdd-ci-zod-resolution` §10 R6; deferred).
16. Removing the `bdd_tsx_node22` workaround tokens or any preceding `fix-bdd-*` change's residue (those are closed and unrelated).
17. Migrating `gastos-personales/` to the vertical-slicing model.
18. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
19. Creating `openspec/specs/<capability>/spec.md` (proposal §4.2 — no capability-level contract change; this spec documents the WHAT in §5 below).
20. Writing an ADR (`docs/architecture/decisions/00XX-turbo-env-vs-passthrough.md`); the 2-line JSDoc-style breadcrumb in `turbo.json` (R3) plus the PR body carries the same context for less ceremony (see §11 Q1).

---

## 5. Functional Requirements

> RFC 2119 keywords. **MUST** = absolute requirement. **SHOULD** = recommended but not blocking. **MAY** = optional.

### R1 — `turbo.json` `bdd` task declares an `env` array of 7 vars

The `turbo.json` `bdd` task (currently at lines 25-28) MUST declare an `env` field whose value is a JSON array of 7 string entries, in this exact order:

1. `"DATABASE_URL"`
2. `"NEXTAUTH_URL"`
3. `"NEXTAUTH_SECRET"`
4. `"API_URL"`
5. `"WEB_ORIGIN"`
6. `"PORT"`
7. `"NODE_ENV"`

The order MUST match the GitHub Actions BDD job-level `env:` block order in `.github/workflows/ci.yml:214-221` for diff readability. The `env` field name MUST be `env` (not `passThroughEnv`, not `globalPassThroughEnv`, not `globalEnv`). The 7 entries MUST match the 7 keys declared in `ci.yml:214-221` exactly: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`. Trailing commas and JSON array formatting MUST be valid against `https://v2-10-3.turborepo.dev/schema.json`.

### R2 — `turbo.json` `build` task declares the same `env` array

The `turbo.json` `build` task (currently at lines 5-8) MUST declare an `env` field whose value is a JSON array containing the same 7 entries in the same order as R1. The rationale is that `pnpm turbo run bdd` triggers `web#build` transitively via `bdd.dependsOn: ["build"]`, and Turbo forwards declared env vars through the chain; undeclared tasks at any point in the chain (build OR bdd) would block propagation. Declaring `env` in BOTH tasks ensures the vars survive the full chain regardless of which entry point the user invokes.

### R3 — The `env` field is `env`, NOT `passThroughEnv`; breadcrumb lives in the PR body, not in `turbo.json`

The new field added per R1 and R2 MUST be the JSON key `"env"`. It MUST NOT be `"passThroughEnv"`, `"globalEnv"`, or `"globalPassThroughEnv"`. The PR description on the merged commit MUST include a 2-line breadcrumb explaining (a) **why** the array exists (Turbo strict-mode strips undeclared env vars) and (b) **what the contract is** (must stay in sync with the `.github/workflows/ci.yml` BDD job env block). Same breadcrumb MUST apply for both the `build` task's `env` field and the `bdd` task's `env` field — one PR-body paragraph carries the rationale that covers both tasks, no need to repeat verbatim on each field.

The breadcrumb MUST NOT be embedded in `turbo.json` itself. JSON does not support comments (RFC 8259 §2 — "no additional syntax is allowed"), and placing `//` tokens inside the file would (a) break the AC10 strict-JSON invariant (`cat turbo.json | python3 -m json.tool` exits 0) and (b) break any future tool that parses the file with a strict JSON parser (e.g., `node -e "JSON.parse(require('fs').readFileSync('turbo.json'))"`). The repository convention for documents that cannot carry inline comments is to put the breadcrumb in the artifact that lives with them — for a closed PR whose `turbo.json` is already merged, that artifact is the PR body / squash commit message, not the file content.

The `env` vs `passThroughEnv` distinction is: `env` participates in the cache key (values invalidate the cache), `passThroughEnv` does NOT participate in the cache key (values reach the process environment but stale builds may be served). Since `@core/config`'s validation runs at module load and the build outputs (Next.js page-data bundles) embed env-derived values, env changes MUST invalidate the cache — `env` is the only correct field name.

> **Superseded by** the apply-phase decision documented in PR #65's squash commit message. The original R3 text mandated a JSDoc-style breadcrumb of two `//` lines inside `turbo.json`, with one line naming "turbo strict-mode" and a follow-up line naming "ci.yml" / ".github/workflows". The original R3 was INTERNALLY CONTRADICTORY with AC10 (`cat turbo.json | python3 -m json.tool` exits 0 — i.e., the file MUST be strict-JSON-parseable, which `//` comments invalidate). The apply phase correctly honored AC10 (strict-JSON file with 7 valid `env` keys) and skipped the `//` breadcrumb, carrying the rationale in the PR body instead. The breadcrumb is now mandated in §5 R3 (above) as a PR-body paragraph. The historical R3 text is preserved here as prose for traceability; future spec authors reading this archive SHOULD NOT copy the `//`-in-JSON pattern. The same defect was identified in `fix-bdd-ci-zod-resolution` (not amended in this PR; deferred to a future housekeeping change per `slice-9-housekeeping/explore.md` §2).
>
> Original R3 intent, preserved in prose form (the two `//` lines mandated by the original R3 are summarized above to honor the JSON-strict invariant — see Q3 amended for the full rationale):
>
> > R3 (original) — The `env` field is `env`, NOT `passThroughEnv`; the original spec mandated a JSDoc-style breadcrumb of exactly 2 lines immediately above the `bdd` task's new `env` field, with content summarizing why the `env` array exists (Turbo strict-mode strips undeclared env vars) and what its sync contract is (must stay in sync with the `.github/workflows/ci.yml` BDD job env block). The same content was meant to apply to the `build` task's `env` field. The defect was that the prescribed breadcrumb format (consecutive `//` lines inside the JSON file) is incompatible with strict JSON per RFC 8259 §2 and with this spec's own AC10 strict-JSON invariant — the apply phase preserved the rationale but relocated the breadcrumb to the PR body.

### R4 — Minimum diff: no other lines in `turbo.json` are touched

The fix MUST edit ONLY the 2 `env` array blocks required by R1 and R2 plus the JSDoc-style breadcrumb required by R3. No other key, value, ordering, or whitespace in `turbo.json` MAY change. Concretely preserved: `$schema` (line 2), `ui` (line 3), `tasks.dev` (lines 9-12), `tasks.lint` (lines 13-16), `tasks.test` (lines 17-20), `tasks.typecheck` (lines 21-24), `tasks.bdd.dependsOn` (line 26), `tasks.bdd.outputs` (line 27), `tasks.e2e` (lines 29-32), `tasks.coverage` (lines 33-36), `tasks.clean` (lines 37-40). The pre-existing `outputs` arrays on `build` and `bdd` MUST stay byte-identical except for the trailing comma needed to append `env`.

### R5 — `pnpm turbo run bdd` exits 0 in CI with the BDD (Cucumber) job reporting `success`

`pnpm turbo run bdd` MUST exit 0 when run on Node 22.13.0 + pnpm 11.10.0 in the CI environment (Postgres 16-alpine, 30-minute timeout) on `feat/fix-ci-env-propagation`. The GitHub Actions `BDD (Cucumber)` job MUST report `success` on the new PR. The job log MUST contain `43 scenarios (43 passed)` (or the per-slice equivalent: `18 scenarios (18 passed)` for auth + `25 scenarios (25 passed)` for transactions).

### R6 — All 43 BDD scenarios continue to pass locally AND in CI

All **43** BDD scenarios MUST pass after the fix: 18 auth scenarios (across the 6 feature files `login-email-password`, `login-locale-routing`, `oauth-google-stub`, `password-reset`, `rbac-admin`, `sessions-list`) + 25 transactions scenarios (across the 6 feature files `create-transaction`, `idempotency-key`, `list-transactions`, `multi-currency-conversion`, `sign-aware-totals`, `soft-delete-categories`). Zero scenarios MUST be skipped, marked `pending`, marked `todo`, deleted, or otherwise short-circuited by the fix. The `pnpm turbo run bdd` exit code MUST be 0 on both the CI runner and the developer's local machine (with `apps/web/.env.test` supplying the env vars).

### R7 — All 4 CI jobs report `success`

All 4 GitHub Actions jobs defined in `.github/workflows/ci.yml` MUST report `success` on `feat/fix-ci-env-propagation`:

1. **Static analysis** (lint + typecheck fixtures).
2. **Build** (the Build job's `continue-on-error: true` pre-existing flag is preserved unchanged per proposal §8; the BDD gate is the authoritative signal — see G1).
3. **Unit + integration** (Vitest across all workspaces).
4. **BDD (Cucumber)** (Cucumber features across both slices).

No CI job MAY report `failure`, `cancelled`, or `skipped` as a result of this change.

### R8 — No `.ts` source file is modified

No file matching `\.ts$|\.tsx$` MAY be modified by this change. Concretely preserved: every file under `apps/api/src/**`, every file under `apps/web/**`, every file under `libs/core/**`, every file under `libs/features/**`, every `world.ts`, every `.steps.ts`, every `support/register.ts`, every `cucumber.mjs`, every `.feature` Gherkin file, every test fixture under `__fixtures__/**`, and every file under `tools/eslint-plugin-boundary/src/**`.

### R9 — No new dependency is added

No file matching `package.json` MAY be modified. No file matching `pnpm-lock.yaml` MAY be modified. No new dev dependency, runtime dependency, version bump, peer dependency, optional dependency, or `pnpm install` of any kind. The fix MUST use only the existing Turbo `env` task field (stable since Turbo 2.0; documented at `https://v2-10-3.turborepo.dev/schema.json#properties/tasks/properties/env`).

### R10 — Cache invalidation works when env vars change

After applying the fix, the Turbo cache MUST invalidate correctly when any of the 7 declared env vars changes. The verification recipe (the sdd-verify phase runs this):

1. Populate cache: `pnpm turbo run build` with `DATABASE_URL=<A>`.
2. Re-run without `--force`: `pnpm turbo run build` with `DATABASE_URL=<B>` (all other vars unchanged).
3. Expected: `web#build` is a **cache miss** (re-runs, not restored from cache), because `DATABASE_URL` is part of the cache hash via the new `env` array.

The empirical verification rule: any task that depends on the changed env var MUST NOT be served from a stale cache. The same recipe applied to any of the 7 vars (e.g., switching `API_URL` from staging to prod) MUST invalidate the `build` and `bdd` caches for the affected packages.

### R11 — PR description calls out the 4-PR BDD bypass history and explains why this is the structural fix

The PR description SHOULD include a one-paragraph **"History"** section explaining the predecessor-fix lineage:

> "This is the structural fix for the latent bug that has caused 4 consecutive PRs (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) to be admin-merged with the BDD gate bypassed. The root cause — Turborepo 2.10.3 in default `strict` env mode strips every env var not declared in `turbo.json` from child task processes — was verified empirically in `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`), Tests 1–5. The actual Zod errors (`API_URL`, `WEB_ORIGIN` undefined at `web#build` collection time) are surface symptoms of an undeclared-task-contract violation in `turbo.json`. Declaring the 7 vars in `build.env` and `bdd.env` closes the gate permanently with no behaviour change."

This history is **SHOULD** (not MUST) because reviewers can reproduce the diagnosis by re-running the explore brief's Test 4; the breadcrumb is for posterity and for first-time readers of the repo.

### R12 — PR description contrasts `env` vs `passThroughEnv` for future maintainers

The PR description SHOULD include a one-paragraph **"`env` vs `passThroughEnv`"** section explaining the cache-correctness distinction:

> "This fix declares the env vars in Turbo's **`env`** field, not `passThroughEnv`. The distinction matters: `env` participates in the task's cache hash, so changing any of the 7 declared vars invalidates the cache and forces a rebuild. `passThroughEnv` exposes values to child processes WITHOUT hashing them — a stale `.next/` build produced under `API_URL=staging` would be happily served for `API_URL=production`. Since `@core/config`'s Zod schema validates env vars at module load and Next.js page-data bundles embed the validated values, env changes MUST invalidate the cache. Use `env` for any var that influences build outputs; reserve `passThroughEnv` for runtime-only signals like `CI` or `NODE_OPTIONS`."

Same **SHOULD** strength as R11: the rationale is already in the `turbo.json` breadcrumb (R3) and in the proposal §3.3, but reviewers often skim the PR body and miss the breadcrumb; putting it in the PR body closes that gap.

---

## 6. Scenarios

> Gherkin Given/When/Then. Each scenario MUST be runnable as a shell command or observable from a clean-checkout reproducer. 6 scenarios, one per goal.

### G1 scenario (BDD CI passes)

#### Scenario: BDD (Cucumber) CI job passes for the first time since PR #61

- GIVEN `turbo.json` declares the 7 env vars (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`) in the `bdd` task's `env` field (R1)
- AND the same 7 vars are declared in the `build` task's `env` field (R2)
- AND the BDD job-level env block in `.github/workflows/ci.yml:214-221` continues to declare the same 7 vars (unchanged)
- WHEN the `BDD (Cucumber)` GitHub Actions job runs on `feat/fix-ci-env-propagation`
- THEN the job MUST report `success`
- AND 43/43 BDD scenarios MUST pass in the job log (18 auth + 25 transactions)

### G2 scenario (4 CI jobs green)

#### Scenario: All 4 CI jobs green

- GIVEN the fix from R1 + R2 + R3 has been applied (and only `turbo.json` was modified per R4)
- AND no CI workflow file in `.github/workflows/**` was modified (R9 + non-goal #4)
- WHEN GitHub Actions runs the CI workflow on the new PR (`feat/fix-ci-env-propagation`)
- THEN **Static analysis** MUST report `success`
- AND **Build** MUST report `success`
- AND **Unit + integration** MUST report `success`
- AND **BDD (Cucumber)** MUST report `success`
- AND no job MUST report `failure`, `cancelled`, or `skipped`

### G3 scenario (43 BDD scenarios preserved)

#### Scenario: 43 BDD scenarios continue to pass

- GIVEN the fix from R1 + R2 + R3 has been applied
- AND no `.feature`, no `.steps.ts`, no `world.ts`, no `support/register.ts`, no `cucumber.mjs`, and no slice `bdd` script has been modified (R8)
- WHEN `pnpm turbo run bdd` is run locally on Node 22.13.0 with `apps/web/.env.test` supplying the env vars
- THEN 18 auth scenarios + 25 transactions scenarios = **43 total** MUST pass
- AND exit code MUST be 0
- AND 0 scenarios MUST be skipped, pending, todo, or deleted

### G4 scenario (local behaviour unchanged)

#### Scenario: Local dev behaviour is unchanged

- GIVEN the fix from R1 + R2 + R3 has been applied
- AND no `.ts` source file was modified (R8)
- AND `apps/web/.env.test` continues to supply the 7 env vars locally (R9)
- WHEN `pnpm turbo run build` is run locally with the standard local env
- THEN exit code MUST be 0
- AND the build output path MUST be identical to the pre-fix baseline (no behavioural change)
- AND direct `next build` (bypassing Turbo) with the same env MUST continue to exit 0

### G5 scenario (cache invalidation works)

#### Scenario: Cache invalidation works when env vars change

- GIVEN the fix from R1 + R2 + R3 has been applied
- AND `pnpm turbo run build` has populated the cache with `DATABASE_URL=<A>` (e.g., `postgresql://localhost:5432/gastos_reference_test`)
- WHEN `DATABASE_URL` is changed to `<B>` (a different valid DSN, e.g., `postgresql://localhost:5432/gastos_reference_test_other`)
- AND `pnpm turbo run build` is run again **without** `--force`
- THEN the `web#build` task MUST NOT use the cache (cache miss)
- AND `web#build` MUST re-execute (because `DATABASE_URL` now participates in the cache hash via the new `env` array)
- AND exit code MUST be 0 on the re-execution

### G6 scenario (surgical diff)

#### Scenario: The fix touches only `turbo.json`

- GIVEN the diff between `feat/fix-ci-env-propagation` and `develop`
- WHEN the file list is filtered by `\.ts$|\.tsx$|\.sh$` (excluding `turbo.json` which is `.json`)
- THEN the filtered list MUST be empty
- AND the filtered list for `\.feature$|\.steps\.ts$|cucumber\.mjs$|support/register\.ts$|world\.ts$` MUST be empty
- AND the filtered list for `apps/api/**` MUST be empty
- AND the filtered list for `apps/web/**` MUST be empty
- AND the filtered list for `libs/**` MUST be empty
- AND the filtered list for `tools/eslint-plugin-boundary/**` MUST be empty
- AND the filtered list for `.github/workflows/**` MUST be empty
- AND the filtered list for `pnpm-lock.yaml` MUST be empty
- AND the remaining changed files MUST contain exactly: `turbo.json`

---

## 7. Constraint Surface

### 7.1 Architectural boundaries (AGENTS.md §7 — enforced by ESLint)

| Rule | Status with fix |
|------|-----------------|
| `no-prisma-outside-core` | Unaffected — no Prisma changes; `new PrismaClient()` still only in `libs/core/database/src/` |
| `no-schemas-outside-shared` | Unaffected — no schema-file changes |
| `no-client-server-import` | Unaffected — no client code changes |
| `no-cross-module-import` | Unaffected — no cross-module imports changed |
| `no-mojibake-in-docs` (optional, slice-8) | Unaffected — no `.md` added under `Documents-es/`; this change does NOT add a Spanish mirror (same precedent as `fix-bdd-tsx-node22`, `fix-bdd-ci-zod-resolution`) |

ESLint fixture check: `pnpm lint:fixtures` MUST continue to exit 0 (no new boundary violations introduced by the `turbo.json` edit). Since no `.ts` / `.tsx` / fixture file is touched (R8 + non-goal #11), the fixture pass count is invariant.

### 7.2 Strict TDD (AGENTS.md §4)

This change is **config-only**. There is no production code to test, so the RED-first step is satisfied vacuously: the empirical reproducer from `explore.md` §4 IS the RED→GREEN evidence — `pnpm turbo run bdd --force` with the CI env reproduces the 5 Zod errors (RED); applying R1 + R2 + R3 and rerunning produces 0 errors (GREEN). The verification commands in §8 ARE the tests. No additional unit test, integration test, BDD scenario, or e2e test is required.

### 7.3 Atomic commits (AGENTS.md §5) and Conventional Commits (AGENTS.md §6)

- The 3 logical edits (R1 + R2 env arrays + R3 breadcrumb) MUST land as a **SINGLE atomic commit** on `feat/fix-ci-env-propagation`. The change is one work unit: "declare the BDD job's 7 env vars in `turbo.json` `build.env` and `bdd.env` so Turbo strict-mode forwards them to `web#build`."
- Commit message type: `fix(ci)` or `fix(build)`. Subject ≤72 chars, imperative, no trailing period. Recommended subject: `fix(ci): declare turbo env for build + bdd tasks so @core/config receives the BDD env vars`.
- Body MUST explain WHY (Turborepo 2.10.3 strict-mode strips undeclared env vars; `web#build` then fails Zod validation at module load because the 7 CI env vars never reach it; declaring the vars in `build.env` + `bdd.env` closes the gap; exploring the explore brief §4 tests), NOT what (the diff is the what).
- **No `Co-Authored-By` line. No AI attribution.** (Per AGENTS.md §6 and the persona's hard rule.)
- `git revert <merge-sha>` MUST cleanly reverse the entire PR.

### 7.4 Branch model (AGENTS.md §2)

- Work branch: `feat/fix-ci-env-propagation` cut from `develop` (NOT from `main`).
- `main` is immutable; no force-push, no delete, no amend of historic commits.
- PR targets `develop` per `chain_strategy=feature-branch-chain` (single tracker for the entire change; `auto-chain` NOT triggered because the change is far below the 400-line review budget).

### 7.5 Single source of truth (AGENTS.md §8)

- The env-var contract lives in exactly one place per gate: `turbo.json` `tasks.build.env` and `turbo.json` `tasks.bdd.env` (R1, R2). The CI job-level `.github/workflows/ci.yml:214-221` env block continues to author the values; `turbo.json` mirrors the keys. If `ci.yml` adds a new env var, `turbo.json` MUST add a matching entry to both `build.env` and `bdd.env` — the R3 breadcrumb says so explicitly.
- No second config file (`package.json`, `tsconfig*.json`, `apps/web/.env*`, `.github/workflows/ci.yml`, etc.) duplicates or shadows this contract. R9 enforces the no-package.json-edit rule.

### 7.6 Spanish mirror (AGENTS.md §13)

- This spec file (`openspec/changes/fix-ci-env-propagation/spec.md`) follows the `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` precedent and is **NOT mirrored** at spec-creation time. The design and tasks artifacts that follow in subsequent phases (if they add English `.md` under `openspec/` or `docs/`) WILL be mirrored per AGENTS.md §13, same as the predecessor changes.
- The proposal itself (`openspec/changes/fix-ci-env-propagation/proposal.md`) is **NOT mirrored** (mirrors apply to ADRs and design specs at apply time; same precedent).
- No English `.md` file is added under `docs/architecture/decisions/` by this change (see §11 Q1 — no ADR).

### 7.7 CI workflow constraints

- BDD job uses Node 22.13.0 + pnpm 11.10.0 + Postgres 16-alpine (`.github/workflows/ci.yml:200-213`). Timeout 30 min. The fix MUST work under these exact conditions.
- The fix MUST NOT alter `.github/workflows/ci.yml` (R9 + non-goal #4).
- The fix MUST work with `pnpm install --frozen-lockfile` (no lockfile regen — R9 requires the lockfile to stay byte-identical).

### 7.8 Cache discipline

- The `env` field (NOT `passThroughEnv`) MUST be used (R3). The values declared in `build.env` and `bdd.env` MUST participate in the task's cache hash. Changing any of the 7 declared env vars MUST invalidate the cache for affected packages (G5 + R10).
- Remote cache entries created before the fix had no env contract and are not expected to be reused; the first CI run after merge repopulates them under the new contract. `--force` is NOT required on first CI run because no green remote cache for `web#build` exists in the slice-7/8 lineage (all predecessor green-CIs came from the bypassed gate path or were failures).

### 7.9 Lockfile discipline

- R9 forbids any `pnpm install` or lockfile regen. `pnpm-lock.yaml` MUST stay byte-identical. No `package.json` edit, so no `pnpm install` is needed.

---

## 8. Test Plan

| Goal | Test command | Expected outcome |
|------|--------------|------------------|
| G1 (BDD CI passes) | GitHub Actions `BDD (Cucumber)` job on the new PR | job reports `success`; 43/43 scenarios |
| G2 (4 jobs green) | GitHub Actions CI on the new PR | Static analysis, Build, Unit + integration, BDD all report `success` |
| G3 (43 scenarios preserved) | `pnpm turbo run bdd` on Node 22.13.0 with `apps/web/.env.test` | exit 0; 18 auth + 25 transactions = 43 |
| G4 (local behaviour unchanged) | `pnpm turbo run build` on developer machine | exit 0; output paths unchanged |
| G5 (cache invalidation) | `pnpm turbo run build` → change `DATABASE_URL` → `pnpm turbo run build` (no `--force`) | second run is cache MISS for `web#build` |
| G6 (surgical diff) | `git diff develop...feat/fix-ci-env-propagation --name-only` | exactly 1 file: `turbo.json` |

### Local verification (run on `feat/fix-ci-env-propagation` before pushing)

```bash
# Verify the env arrays exist in both tasks:
grep -A 9 '"env": \[' turbo.json

# Verify only turbo.json was modified in the working tree:
git diff develop --name-only
# Expected output: turbo.json

# Verify the lockfile is byte-identical:
git diff develop -- pnpm-lock.yaml | head -1
# Expected output: empty (no diff)

# Verify no .ts source file was modified:
git diff develop --name-only -- '*.ts' '*.tsx'
# Expected output: empty

# Run the BDD suite locally (mirrors the CI command):
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run bdd --force
# Expected: exit 0; auth 18/18 + transactions 25/25 = 43/43; web#build green

# Cache invalidation check (R10 / G5):
pnpm turbo run build --force  # populate cache under DATABASE_URL=<A>
# change DATABASE_URL (any other valid DSN), then:
pnpm turbo run build 2>&1 | grep -E '(web|api).*(CACHE HIT|cache hit|CACHED)'
# Expected output: empty (cache miss for both web#build and api#build)

# Quality gates from AGENTS.md §3:
pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test && pnpm lint:fixtures
# Expected: all exit 0
```

### Manual inspection (read-the-diff)

- Inspect `turbo.json` lines 5-8 (`build` task) and lines 25-28 (`bdd` task) to confirm the `env` arrays exist with all 7 entries in the correct order, and that the JSDoc-style breadcrumb sits immediately above the `bdd` task's `env` field per R3.
- Inspect the PR body for the `R11` history paragraph and the `R12` `env`-vs-`passThroughEnv` paragraph.

---

## 9. Acceptance Criteria

> Binary pass/fail conditions for `sdd-verify`. Every criterion MUST be testable from a fresh `git checkout feat/fix-ci-env-propagation`.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| AC1 | `build.env` array contains all 7 vars | `jq '.tasks.build.env' turbo.json` returns a 7-element array containing exactly `["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "API_URL", "WEB_ORIGIN", "PORT", "NODE_ENV"]` |
| AC2 | `bdd.env` array contains all 7 vars | `jq '.tasks.bdd.env' turbo.json` returns the same 7-element array as AC1 |
| AC3 | Both env arrays are in the same order | the 2 arrays returned by AC1 and AC2 MUST be element-wise identical |
| AC4 | Order matches CI job env block | each `turbo.json` env array, when compared position-by-position to the keys in `.github/workflows/ci.yml:214-221`, MUST match exactly |
| AC5 | The new field name is `env` | both new fields in `turbo.json` MUST be named `env`; `jq '.tasks.build \| has("passThroughEnv")'` and `jq '.tasks.bdd \| has("passThroughEnv")'` MUST return `false` |
| AC6 | No `passThroughEnv` anywhere in `turbo.json` | `grep -c '"passThroughEnv"' turbo.json` returns `0` |
| AC7 | No `globalEnv` / `globalPassThroughEnv` at root | `jq 'has("globalEnv") or has("globalPassThroughEnv")' turbo.json` returns `false` |
| AC8 | PR description carries the 2-line breadcrumb | the merged PR's description (or squash commit message) contains 2 consecutive lines naming "turbo strict-mode" (or equivalent) and "ci.yml" (or equivalent), explaining the rationale for the `bdd.env` and `build.env` arrays. The breadcrumb is NOT required to live inside `turbo.json` (JSON does not support comments per RFC 8259 §2). |
| AC9 | Only `turbo.json` modified | `git diff develop --name-only` lists exactly `turbo.json` (1 file, no lockfile, no .ts/.tsx/.feature/.steps.ts, no .yml/.yaml) |
| AC10 | `turbo.json` post-fix is structurally valid JSON | `jq . turbo.json` exits 0; `cat turbo.json \| python3 -m json.tool` exits 0 |
| AC11 | `turbo.json` matches the schema | `pnpm exec turbo --root=. run --dry=json bdd 2>&1` exits 0 with valid task graph; no schema validation error |
| AC12 | No `.ts` / `.tsx` source file modified | `git diff develop --name-only -- '*.ts' '*.tsx'` returns empty |
| AC13 | No `package.json` modified | `git diff develop --name-only -- 'package.json' 'apps/*/package.json' 'libs/**/package.json'` returns empty |
| AC14 | No `pnpm-lock.yaml` modified | `git diff develop --stat -- pnpm-lock.yaml` returns no changes |
| AC15 | No `.github/workflows/ci.yml` modified | `git diff develop --name-only -- .github/workflows/ci.yml` returns empty |
| AC16 | No `.env*` file modified | `git diff develop --name-only -- '*.env' '*.env.*'` returns empty |
| AC17 | No ESLint / boundary-plugin files modified | `git diff develop --name-only -- 'tools/eslint-plugin-boundary/**' 'eslint.config.*'` returns empty |
| AC18 | `pnpm turbo run bdd` exits 0 locally with CI env | on Node 22.13.0, with the 7 env vars from `.github/workflows/ci.yml:214-221`, the command exits 0 and prints `43 scenarios (43 passed)` (or per-slice equivalents totalling 43) |
| AC19 | Auth BDD exits 0 | `pnpm --filter @features/auth bdd` exits 0; 18/18 scenarios |
| AC20 | Transactions BDD exits 0 | `pnpm --filter @features/transactions bdd` exits 0; 25/25 scenarios |
| AC21 | 0 BDD scenarios skipped/pending/todo | BDD log shows 43 executed, 0 skipped, 0 pending, 0 todo |
| AC22 | `web#build` and `api#build` both pass in the same graph | `pnpm turbo run bdd --force` log includes both `web:build` and `api:build` with `> SUCCESS` (not `> FAIL`) |
| AC23 | Cache invalidation works on env change | after `pnpm turbo run build` with `DATABASE_URL=<A>`, rerunning with `DATABASE_URL=<B>` (no `--force`) is a cache miss for `web#build` and `api#build`; both re-execute |
| AC24 | All quality gates from AGENTS.md §3 pass | `pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test && pnpm lint:fixtures` exits 0 |
| AC25 | GitHub Actions `BDD (Cucumber)` job reports `success` on the PR | GitHub Actions UI shows the job as green; job log contains `43 scenarios (43 passed)` |
| AC26 | All 4 CI jobs report `success` on the PR | GitHub Actions UI shows Static analysis, Build, Unit + integration, BDD (Cucumber) all green |
| AC27 | Single atomic commit | `git log --oneline develop..feat/fix-ci-env-propagation` shows exactly 1 commit |
| AC28 | Conventional Commit subject format | `git log -1 --pretty=%s` matches `^fix\([a-z-]+\): .+` and is ≤72 chars |
| AC29 | No `Co-Authored-By` in commit body | `git log feat/fix-ci-env-propagation --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC30 | PR body includes the R11 history paragraph | the PR description on the new PR contains a paragraph mentioning at least 3 of the 4 predecessor-PR names (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) or the count "4 consecutive PRs" |
| AC31 | PR body includes the R12 `env` vs `passThroughEnv` paragraph | the PR description contrasts `env` (cache-hashed) with `passThroughEnv` (not cache-hashed) in at least one sentence |
| AC32 | `pnpm install --frozen-lockfile` exits 0 in CI | on the CI runner, the install step exits 0 (no lockfile drift, per R9 + AC14) |

---

## 10. Out of Scope

(Mirrored from proposal §2.2 + non-goals above; non-goals above are operational, this section is the formal review check.)

1. Anything in AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
2. Lazy-validating `@core/config` to defer the Zod validation out of module load (proposal Shape B / explore brief Shape A — separate architectural change).
3. Switching from `env` to `passThroughEnv` (proposal Shape D — rejected for cache-correctness reasons; see R3 and §11 Q4).
4. Declaring the env vars at the top level of `turbo.json` via `globalEnv` / `globalPassThroughEnv` (per-proposal §10 Q2 — rejected to avoid bloating lint/test/typecheck/e2e/dev cache hashes).
5. Editing `.github/workflows/ci.yml` (the BDD job's env block at lines 214-221 is correct as authored; the contract violation is in the Turbo task definition).
6. Editing `libs/core/config/env.ts`, `env.schema.ts`, or `index.ts` (eager validation stays; it exposed a real bug).
7. Editing `apps/web/auth.ts` or any `apps/web/app/[locale]/**/*.tsx` RSC page.
8. Editing `apps/api/**` (controllers, services, Prisma schema, `nest-cli.json`).
9. Editing `.env*` files (`apps/web/.env.test`, `apps/web/.env.example`).
10. Adding a `package.json` to `libs/features/{auth,transactions}/shared/` (architectural orphan-directory fix; **deferred to a future `fix-orphan-shared-directories` change** — same breadcrumb as `fix-bdd-ci-zod-resolution` §11 Q5).
11. Setting `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (Shape B from `fix-bdd-ci-zod-resolution` §3.5 — rejected).
12. Adding `continue-on-error: false` to the Build job's `web#build` step (pre-existing governance issue from `fix-bdd-ci-zod-resolution` §10 R6).
13. Removing or revisiting `fix-bdd-tsx-node22` (predecessor — loader hook token; that change is closed and unrelated).
14. Removing or revisiting `fix-bdd-ci-zod-resolution` (predecessor — orphan-schema zod resolution; that change is closed and unrelated).
15. Pinning or upgrading any dependency.
16. Adding any new dev dependency, runtime dependency, build script, ESLint rule, or boundary-plugin fixture.
17. Adding any new unit test, BDD scenario, or e2e test.
18. Adding a CI smoke test that strips HOME pollution or any other new CI step.
19. Writing an ADR (`docs/architecture/decisions/00XX-turbo-env-vs-passthrough.md`). See §11 Q1.
20. Adding a CI lint step that diffs `turbo.json#bdd.env` against `ci.yml#bdd.env` to assert completeness. See §11 Q2.
21. Migrating `gastos-personales/` to the vertical-slicing model.

---

## 11. Open Questions — RESOLVED

The proposal deferred 5 questions to the spec phase. They are now resolved:

### Q1 — ADR for the Turbo `env`-vs-`passThroughEnv` distinction

**Resolved**: **NO ADR.**

Rationale: the change is 14 LOC of build-config in 1 file. An ADR for a config tweak of this size is bureaucratic overhead. The **2-line JSDoc-style breadcrumb in `turbo.json`** (R3) is a better fit for the size: it lives directly above the `bdd.env` array it documents, names the root cause (Turbo strict-mode strips undeclared env vars), and points future contributors to `ci.yml:214-221` for the contract. The R12 PR description requirement carries the full contrast paragraph (`env` participates in cache hash; `passThroughEnv` does not), so a separate `docs/architecture/decisions/00XX-*.md` would only restate what's already in the file header and the PR body. This precedent (config-only fix → inline comment + PR body, no ADR) matches the `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` precedents for analogous surgical build-config fixes.

### Q2 — CI lint step for env completeness

**Resolved**: **NO CI lint step.**

Rationale: scope creep. A diff-based check (`scripts/check-turbo-env.ts` that asserts the 7 keys in `turbo.json#bdd.env` equal the 7 keys in `ci.yml#bdd.env`) would harden the contract against future drift, but (a) it adds a new script + CI job step + maintenance burden for a one-line invariant; (b) the R3 breadcrumb already names `ci.yml:214-221` as the source of truth, so any contributor who edits one without the other will see the breadcrumb flag both files in the diff; (c) the PR review process is the natural enforcement point for the next change that touches either file. Defer to a separate `chore-add-turbo-env-completeness-lint` change (or whichever name fits) if and when the pattern repeats.

### Q3 — Breadcrumb location (in `turbo.json` vs in PR body)

**Resolved**: **PR BODY** — R3 (as amended) mandates a 2-line breadcrumb in the PR description / squash commit message, NOT inside `turbo.json`.

Rationale: the original "in `turbo.json` as `//` lines" decision was INTERNALLY CONTRADICTORY with the spec's own AC10 (`cat turbo.json | python3 -m json.tool` exits 0 — strict-JSON invariant). The apply phase correctly honored AC10 over R3 and carried the rationale in PR #65's squash commit body. Future spec authors should be aware that JSON does not support comments (RFC 8259 §2); a breadcrumb inside a JSON file breaks any strict-JSON parser (Python's `json.tool`, `JSON.parse`, jq with default settings, etc.). For documents that cannot carry inline comments, the breadcrumb belongs in the artifact that lives with them — typically the squash commit message / PR body for a closed PR whose `.json` file is already merged, or a sibling `.md` file for an open spec. The breadcrumb must (a) name the root cause ("Turbo strict-mode strips undeclared env vars") so future contributors don't wonder why an `env` array was added if they haven't read the explore brief, and (b) name the contract source (`.github/workflows/ci.yml` BDD job env block) so the next contributor who adds an env var to CI is prompted to mirror it in `turbo.json`. Two lines is the minimum sufficient content; longer prose bloats the diff without adding reviewer value. The same defect pattern was identified in the predecessor `fix-bdd-ci-zod-resolution` archive and is flagged as future housekeeping per `slice-9-housekeeping/explore.md` §2 (not in scope for slice-9).

### Q4 — `passThroughEnv` instead of `env` (added during propose phase)

**Resolved**: **`env`**, not `passThroughEnv`. R3 enforces this by name, and AC5/AC6/AC7 verify it in CI.

Rationale: `env` is the **cache-correct** shape: values are included in the task's cache hash, so changing any of the 7 vars (e.g., switching `API_URL` from staging to prod) invalidates `web#build` and `bdd` caches for the affected packages. `passThroughEnv` exposes values to child processes WITHOUT hashing them — a stale `.next/` build produced under `API_URL=staging` would be happily served for `API_URL=production`. Since `@core/config`'s validation runs at module load and the resulting validated env values (especially `API_URL` and `WEB_ORIGIN`) are embedded into Next.js page-data bundles, env changes MUST invalidate the cache. `env` is the only correct field name.

### Q5 — Regression test for the undeclared-env-var failure mode (added during propose phase)

**Resolved**: **NO new test.**

Rationale: this is a config-only fix where the test IS the CI BDD job itself. Pre-fix: the BDD job fails with 5 Zod errors at `web#build` collection time. Post-fix: the BDD job passes with 43/43 scenarios. The contract is exercised end-to-end on every PR; adding a Vitest unit test for "Turbo declares the 7 env vars" would assert a structural property of `turbo.json` that is more cheaply asserted by `jq .tasks.bdd.env` (AC1, AC2, AC4). The empirical reproducer from explore §4 Tests 1-5 — direct `pnpm build` with CI env → SUCCESS, `pnpm turbo run bdd` with CI env → FAILURE (RED), apply fix, same `pnpm turbo run bdd` → SUCCESS (GREEN) — IS the test. Section 8's local verification recipe captures the same boundary in two commands any future maintainer can run.

### Q6 — Predecessor ADR on Turbo env semantics (proposal §10 Q5)

**Resolved**: **NO** (already covered by Q1 above). The 2-line JSDoc breadcrumb in R3 plus the R12 PR description paragraph is the entire "predecessor ADR" — at this scale, an actual ADR file would be documentation theatre, not signal.

### Q7 — `openspec/specs/` capability creation

**Resolved**: **NO new capability file.**

Rationale: per proposal §4.2, the proposal claims no spec-level behaviour change. This fix is a build-system mechanics correction — the 43 BDD scenarios, slice server packages, schema content, app source code, step definitions, world types, Gherkin `.feature` files, Cucumber configs, `support/register.ts` files, `cucumber.mjs` files, and `@core/config` schema all stay byte-identical. The capabilities (`auth`, `transactions`, `api-runtime`, `web-runtime`) are unchanged. Creating `openspec/specs/ci-env-propagation/spec.md` would invent a capability name preemptively, with no observable behavioural contract attached. The fix is documented in this delta spec, the proposal, the explore brief, the R3 breadcrumb, and (via R11 + R12) the PR body.

---

## 12. Traceability

### Goal → Requirement → Scenario → Acceptance Criterion

| Goal | Requirements | Scenarios | Acceptance Criteria |
|------|--------------|-----------|---------------------|
| G1 (BDD CI passes) | R1, R2, R5 | G1.1 | AC5, AC18, AC19, AC20, AC21, AC25 |
| G2 (4 CI jobs green) | R1, R2, R7 | G2.1 | AC25, AC26 |
| G3 (43 scenarios preserved) | R6, R8 | G3.1 | AC12, AC18, AC19, AC20, AC21 |
| G4 (local behaviour unchanged) | R4, R6, R8, R9 | G4.1 | AC9, AC12, AC13, AC14, AC18 |
| G5 (cache invalidation) | R1, R2, R3, R10 | G5.1 | AC1, AC2, AC5, AC23 |
| G6 (surgical diff) | R4, R8, R9 | G6.1 | AC9, AC12, AC13, AC14, AC15, AC16, AC17 |

### Requirement ↔ Acceptance Criterion matrix

| Requirement | Acceptance Criteria |
|-------------|---------------------|
| R1 | AC1, AC3, AC4, AC25 |
| R2 | AC2, AC3, AC4, AC25 |
| R3 | AC5, AC6, AC7, AC8 |
| R4 | AC9, AC10, AC11 |
| R5 | AC18, AC19, AC20, AC21, AC22, AC25 |
| R6 | AC18, AC19, AC20, AC21 |
| R7 | AC26 |
| R8 | AC12 |
| R9 | AC13, AC14, AC15, AC32 |
| R10 | AC23 |
| R11 | AC30 (PR description convention; visible at review time, not gated by AC technically) |
| R12 | AC31 (PR description convention; visible at review time, not gated by AC technically) |

### Risk ↔ requirement mitigation (from proposal §7)

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (declaring all 7 vars inflates cache-key space and may invalidate caches more often than desired) | This is the **intended behaviour**: env vars flowing through eager module-load validation SHOULD invalidate the cache. Other envs (`TURBO_TOKEN`, `PATH`) are hashed separately by Turbo and unaffected. R3 + R10 + AC23 enforce cache correctness. |
| R2 (missing a required env var would surface as a different Zod failure) | Explore enumerated all 5 required string fields + the 2 simpler types empirically (explore §4 Tests 4-5). R1 + R2 declare all 7 — minimum complete contract. Adding future vars is straightforward append. |
| R3 (future env var additions require updating `turbo.json`) | Documented in the R3 breadcrumb (`must stay in sync with .github/workflows/ci.yml BDD job env block`). Adding a CI lint check is out of scope per §11 Q2. |
| R4 (future contributor picks `passThroughEnv` and silently breaks cache correctness) | The R3 breadcrumb and the R12 PR description paragraph both document the distinction explicitly. AC5/AC6/AC7 verify the field name is `env` (not `passThroughEnv`) post-fix. |
| R5 (remote cache entries created before this fix may have hidden env assumptions) | The first CI run after merge effectively repopulates the remote cache under the new contract. No green remote cache for `web#build` exists in the slice-7/8 lineage (all predecessor green-CIs came from the bypassed gate path or were failures). `--force` is NOT required on first CI run. |
| R6 (Build job's `continue-on-error: true` masks build failure) | Out of scope per non-goal #12; BDD gate (G1) is the authoritative signal. Pre-existing governance issue, deferred. |
| R7 (Turbo `env` semantics changed across minors) | Turbo's `env` field has been stable since 2.0; `^2.10.3` (root `package.json`) pins to the same minor. Standard contract for any Turbo config. |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
- **Explore brief**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`)
- **Smoking-gun error**: `ZodError: Required: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, API_URL, WEB_ORIGIN at libs/core/config/env.ts:89` (eager module-load validation), surfaced during Next.js page-data collection at `web#build`.
- **Loading-config references**:
  - `turbo.json:5-8` — current `build` task (no `env`/`passThroughEnv`); the 7-line gap the fix closes.
  - `turbo.json:25-28` — current `bdd` task (no `env`/`passThroughEnv`); same gap.
  - `.github/workflows/ci.yml:214-221` — BDD job-level `env` block with all 7 vars. The contract `turbo.json` must propagate.
  - `libs/core/config/env.ts:89` — `export const env = parseEnv(process.env)` (eager module-load validation that surfaces the bug).
  - `libs/core/config/env.schema.ts` — Zod schema with the 5 required string fields (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`) + `NODE_ENV` enum + `PORT` positive integer (optional, default `3001`).
- **Empirical reproducer (from explore §4)**:
  ```bash
  # RED — pre-fix:
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
  NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
  NEXTAUTH_URL=http://localhost:3000 \
  WEB_ORIGIN=http://localhost:3000 \
  API_URL=http://localhost:3001 \
  PORT=3001 \
  NODE_ENV=test \
  pnpm turbo run bdd --force
  # Expected on develop (RED): web#build fails on Zod errors during page-data collection;
  # auth 18/18 + transactions 25/25 do NOT run because bdd.dependsOn: ["build"] blocks.

  # GREEN — post-fix (R1 + R2 + R3 applied):
  # Same command; expected: exit 0; web#build green; auth 18/18 + transactions 25/25 = 43/43.

  # Loose-mode control (proves the boundary is Turbo, not Next):
  pnpm turbo run build --filter=web --force --env-mode=loose
  # Pre-fix GREEN with the CI env — confirms Next.js is downstream of the loss, not its source.
  ```
- **BDD gate history** (per proposal §1 + §11): PR #61 merged the env-rich BDD job config; 4 subsequent PRs (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) were admin-merged with the BDD gate bypassed because of this latent bug. Fixing this proposal closes the underlying gate permanently.
- **Predecessor proposal 1**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/spec.md` — mirrored this 12-section structure for analogous surgical config fix; same author, same hybrid artifact store, same single-PR shape.
- **Predecessor proposal 2**: `openspec/changes/fix-bdd-ci-zod-resolution/spec.md` — mirrored this 12-section structure for analogous compound surgical config fix; same author, same hybrid artifact store, same single-PR shape, ~3× larger scope.
- **Project conventions**: AGENTS.md §2 (branch — develop → tracker `feat/fix-ci-env-propagation`), §3 (quality gates — all six must pass, particularly `pnpm turbo run bdd` exit 0), §4 (strict TDD — config-only fix, no RED test needed because no production code is touched; the explore brief's Tests 1-5 ARE the empirical RED/GREEN boundary), §5 (atomic commits — single work-unit commit touching 1 source file), §6 (Conventional Commits — `fix(ci): declare turbo env for build + bdd tasks so @core/config receives the BDD env vars`), §7 (architectural boundaries — none affected; `tools/eslint-plugin-boundary/**` unchanged), §11 (out-of-scope list — none of its items touched), §12 (pre-commit checklist — single-purpose commit, rollback-trivial, ESLint untouched, no Spanish mirror required because no English `.md` is added under `openspec/` or `docs/` beyond the proposal itself), §13 (Spanish mirror — none required at spec-creation time; mirror policy at apply/design time matches the `fix-bdd-*` precedent).

---

**Next phase**: `design` (`sdd-design` will produce the exact diff hunks for `turbo.json` `build.env` array, `turbo.json` `bdd.env` array, and the 2-line JSDoc-style breadcrumb — translating this WHAT into a literal patch).
