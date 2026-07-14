# Delta Spec — `fix-bdd-tsx-node22`

> **Change**: `fix-bdd-tsx-node22` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-bdd-tsx-node22`
> **Mode**: auto · **Artifact store**: hybrid · **Delivery**: single PR (NOT auto-chain)
> **Date**: 2026-07-13
> **Fix shape**: **A** — single-token-per-line swap in 2 slice `package.json` files
> **Single PR**: 3 files, ~85 net LOC (well under the 400-line review budget)
> **Proposal**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
> **Explore brief**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`)

---

## 1. Header

| Field | Value |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-bdd-tsx-node22` (cut from `develop@ea7732f`) |
| Date | 2026-07-13 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Proposal Engram `#2307`; Explore Engram `#2306`; failing CI run `29288016689` |
| Fix shape | A (per proposal §0) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | single PR — `auto-chain` NOT triggered (82 LOC < 400-line review budget) |
| Strict TDD | active (AGENTS.md §4) — config-only fix; no RED-test required (no production code touched) |

---

## 2. Intent

The BDD CI gate on `develop` is broken on Node 22. CI run `29288016689` fails every BDD-validating PR with `SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule` (Node `22.14.0`, identical stack at `22.13.0`). The root cause is verified empirically, not hypothesised: Cucumber 13's `require:` config invokes Node's **CJS** `require()` to load `support/register.ts` (`@cucumber/cucumber/lib/try_require.js:8`), while the slice `bdd` scripts register the **ESM** loader hook (`--import tsx/esm`). ESM hooks do NOT intercept CJS `require()`. Node 22 then parses the `.ts` file as CJS, hits TypeScript-only `import type` syntax, and throws. The original (incorrect) hypothesis that pinned the bug on tsx 4.23.0 is empirically falsified: tsx 4.22.5, 4.23.0, and 4.23.1 all fail identically. The fix is a one-token-per-line swap: `--import tsx/esm` → `--import tsx/cjs` (the official tsx CJS register hook, shipped since tsx 4.16.x). Empirically verified: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` on Node `22.14.0` returns `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s. This spec locks the fix into 6 testable goals: auth slice BDD GREEN, transactions slice BDD GREEN, full turbo BDD pipeline GREEN, zero regression on scenario count, CI gate flips FAIL→PASS, and the diff touches only the intended 2 lines + 1 new verification script.

---

## 3. Goals

### G1 — Auth slice BDD suite is GREEN on Node 22.x

`pnpm --filter @features/auth bdd` MUST exit 0 on Node 22.13.0 (CI version). All 18 auth scenarios across the 6 feature files (`login-email-password`, `login-locale-routing`, `oauth-google-stub`, `password-reset`, `rbac-admin`, `sessions-list`) MUST pass; all 101 auth steps MUST pass. The runtime MUST be comparable to the empirical baseline (~0.34s for the scenarios themselves, before Postgres startup).

### G2 — Transactions slice BDD suite is GREEN on Node 22.x

`pnpm --filter @features/transactions bdd` MUST exit 0 on Node 22.13.0. All 25 transactions scenarios across the 6 feature files (`create-transaction`, `idempotency-key`, `list-transactions`, `multi-currency-conversion`, `sign-aware-totals`, `soft-delete-categories`) MUST pass.

### G3 — Full turbo BDD pipeline is GREEN

`pnpm turbo run bdd` MUST exit 0 across the workspace. The 2 BDD-bearing packages (`@features/auth`, `@features/transactions`) MUST exit 0; the 11 packages without a `bdd` script (`@core/config`, `@core/database`, `@core/events`, `@shared-utils/*`, `@gpr/eslint-plugin-boundary`, `apps/api`, `apps/web`) MUST exit immediately and contribute no failures.

### G4 — Zero scenario regression

The total BDD scenario count MUST remain 43/43 (18 auth + 25 transactions). No scenario MUST be skipped, marked `pending`, marked `todo`, deleted, or otherwise short-circuited by the fix. No step definition MUST be modified.

### G5 — CI gate flips FAIL → PASS

The `BDD (Cucumber)` GitHub Actions job on Node 22.13.0 MUST report `success` on `feat/fix-bdd-tsx-node22`, replacing the previous `FAIL` state observed in CI run `29288016689`. The job log MUST show 43/43 scenarios passing.

### G6 — Surgical diff (config + verification only)

`git diff develop...feat/fix-bdd-tsx-node22 --name-only` MUST touch exactly 3 files: the two slice `package.json` files (each with 1 line changed) and the new `scripts/bdd/verify.sh`. No `.ts` source file, no `.feature` file, no `.steps.ts` file, no `cucumber.mjs` file, no `support/register.ts` file, no `pnpm-lock.yaml`, no `.github/workflows/ci.yml`, no ESLint config, no `tools/eslint-plugin-boundary/**` file MUST be modified.

---

## 4. Non-Goals

The following are explicitly **out of scope** for this change (mirrored from proposal §2.2 + AGENTS.md §11):

1. Switching Cucumber's loader mechanism from `require:` to `import:` (proposal Shape B). Can be revisited in a dedicated change.
2. Rewriting `support/register.ts` as CJS (Shape C) — would erase the slice-7 PR-8 / slice-8 PR-1 architectural decision.
3. Replacing tsx with another register such as `@swc-node/register` (Shape D) — introduces a new dev dependency.
4. Adding a new dev dependency of any kind.
5. Editing any `.ts` source file: `world.ts`, `.steps.ts`, `support/register.ts`, `cucumber.mjs` (any of these invalidates the surgical-diff goal G6).
6. Editing `.feature` files (Gherkin scenarios stay byte-identical; the fix only changes which Node loader hook transforms TypeScript at `require()` time).
7. Editing `.github/workflows/ci.yml` (the BDD job config is correct: Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout — it just needs the slice scripts to work).
8. Pinning or upgrading tsx (`^4.23.0` already covers the `tsx/cjs` hook which shipped in tsx 4.16.x).
9. Changing the Node version baseline (Node 22.13.0 stays the CI target).
10. Editing `tsconfig.base.json`, `apps/web/**`, `apps/api/**`.
11. Editing ESLint config, ESLint boundary plugin, ESLint fixtures, or ESLint runner.
12. Adding a new BDD scenario, unit test, or e2e test.
13. Adding `bdd:debug` script (proposal Q2 — rejected).
14. Adding `--bail` to the CI bdd job (proposal Q3 — rejected).
15. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
16. Migrating `gastos-personales/` to the vertical-slicing model.

---

## 5. Functional Requirements

> Keywords per RFC 2119. MUST = absolute requirement. SHOULD = recommended but not blocking. MAY = optional.

### R1 — `libs/features/auth/server/package.json` `bdd` script uses `--import tsx/cjs`

The `bdd` script at `libs/features/auth/server/package.json:17` MUST contain the literal string `NODE_OPTIONS='--import tsx/cjs'` in place of `NODE_OPTIONS='--import tsx/esm'`. No other character on that line MAY change; no other line in that file MAY change.

### R2 — `libs/features/transactions/server/package.json` `bdd` script uses `--import tsx/cjs`

The `bdd` script at `libs/features/transactions/server/package.json:17` MUST contain the literal string `NODE_OPTIONS='--import tsx/cjs'` in place of `NODE_OPTIONS='--import tsx/esm'`. No other character on that line MAY change; no other line in that file MAY change.

### R3 — Backward-compatible with Node 22.x and Node 23.x

The fix MUST remain functional on Node 22.13.0 (CI target) and Node 23.x (local dev default). The fix MUST NOT introduce a behavior difference between Node majors. Verified by the empirical test (`NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` on Node 22.14.0 → 18/18 PASS in 0.34s) and the `tsx/cjs` hook contract documented at <https://tsx.is/getting-started> (the hook patches Node's CJS `Module._compile` and `Module._extensions['.ts']` regardless of Node major).

### R4 — Minimum diff

The diff against `develop` MUST be limited to: (a) the two `package.json` lines per R1 and R2; (b) the new file `scripts/bdd/verify.sh` per R10. No other file MUST be modified, renamed, deleted, or created.

### R5 — `pnpm turbo run bdd` exits 0 on Node 22.x

`pnpm turbo run bdd` MUST exit 0 on Node 22.13.0 (CI version). All BDD-bearing packages MUST report exit 0. The non-BDD packages MUST exit 0 immediately without contributing failures.

### R6 — All 43 BDD scenarios continue to pass

The 18 auth scenarios and 25 transactions scenarios (43 total) MUST all pass after the fix. Zero scenarios MUST be skipped, marked pending, marked todo, deleted, or otherwise short-circuited. The scenario count MUST be exactly 43 before and after.

### R7 — No step-def file is modified

No file matching `libs/features/*/docs/step-defs/*.steps.ts` MAY be modified. The 5 step-def files (`common.steps.ts`, `realm.steps.ts` in auth; `actions.steps.ts`, `common.steps.ts`, `data.steps.ts` in transactions) MUST stay byte-identical.

### R8 — No `cucumber.mjs` or `support/register.ts` is modified

Neither of the 2 `cucumber.mjs` files (`libs/features/auth/docs/cucumber.mjs`, `libs/features/transactions/docs/cucumber.mjs`) MAY be modified. Neither of the 2 `support/register.ts` files (one per slice) MAY be modified.

### R9 — No new dependency is added

The change MUST NOT add, remove, or upgrade any package in any `package.json` file. `pnpm-lock.yaml` MUST NOT change. The fix relies on the already-declared `tsx@^4.23.0` (which resolves to the installed `4.23.0`, satisfying the `>=4.16.0` requirement for the `tsx/cjs` hook).

### R10 — New `scripts/bdd/verify.sh` script

A new shell script MUST be added at `scripts/bdd/verify.sh`. The script MUST:
1. Detect and switch to Node 22.x if a version manager (`nvm`, `asdf`, `volta`, or `fnm`) is available; if no manager is detected, log a warning but proceed.
2. Log the Node version (`node --version`) and the resolved tsx version (`pnpm ls tsx 2>/dev/null | head` or equivalent).
3. Run `pnpm turbo run bdd` and propagate its exit code.
4. Log a final line with the result (`OK` on success, `FAIL` on failure) and the total scenario count when available.
5. Be marked executable (`chmod +x`) and pass `bash -n` syntax validation.

### R11 — `pnpm bdd:verify` script wired into root `package.json` (recommended)

The root `package.json` SHOULD add a `"bdd:verify": "bash scripts/bdd/verify.sh"` script so contributors can run the verification via `pnpm bdd:verify`. Wiring is optional but recommended for discoverability.

### R12 — PR description explicitly calls out the CI gate fix

The PR description SHOULD lead with a one-line statement that this restores the previously-broken BDD CI gate on `develop@ea7732f` (failing run `29288016689` → green on `feat/fix-bdd-tsx-node22`). The description SHOULD cite the explore brief as evidence of the empirical root-cause investigation.

---

## 6. Scenarios

> Gherkin Given/When/Then format. Every scenario MUST be runnable as an automated test or shell command.
>
> 6 scenarios total, one per goal.

### G1 scenario (auth slice BDD GREEN)

#### Scenario: Auth BDD suite passes on Node 22.x with the new CJS hook

- GIVEN `libs/features/auth/server/package.json` has the `bdd` script containing `NODE_OPTIONS='--import tsx/cjs'`
- WHEN `pnpm --filter @features/auth bdd` is run on Node 22.13.0
- THEN 18 of 18 scenarios MUST pass
- AND all 101 steps MUST pass
- AND the exit code MUST be 0

### G2 scenario (transactions slice BDD GREEN)

#### Scenario: Transactions BDD suite passes on Node 22.x with the new CJS hook

- GIVEN `libs/features/transactions/server/package.json` has the `bdd` script containing `NODE_OPTIONS='--import tsx/cjs'`
- WHEN `pnpm --filter @features/transactions bdd` is run on Node 22.13.0
- THEN 25 of 25 scenarios MUST pass
- AND the exit code MUST be 0

### G3 scenario (turbo BDD pipeline GREEN)

#### Scenario: Full turbo BDD pipeline passes

- GIVEN the `bdd` scripts in both slice `package.json` files use `--import tsx/cjs`
- WHEN `pnpm turbo run bdd` is run on Node 22.13.0
- THEN all BDD-bearing packages (`@features/auth`, `@features/transactions`) MUST exit 0
- AND the total scenario count MUST be 43 (18 auth + 25 transactions)
- AND packages without a `bdd` script MUST exit 0 immediately without contributing failures

### G4 scenario (zero scenario regression)

#### Scenario: BDD scenario count and identity are preserved

- GIVEN the slice `.feature` files and step-def files are byte-identical to `develop`
- WHEN `pnpm turbo run bdd` runs on Node 22.13.0
- THEN the runner MUST report exactly 43 executed scenarios (18 auth + 25 transactions)
- AND 0 scenarios MUST be skipped, pending, todo, or otherwise short-circuited
- AND the failure count MUST be 0

### G5 scenario (CI gate flips)

#### Scenario: BDD CI gate goes from fail to pass

- GIVEN the PR is opened with the 2-line fix + new `scripts/bdd/verify.sh`
- WHEN GitHub Actions runs the `BDD (Cucumber)` job on Node 22.13.0
- THEN the job MUST report `success`
- AND the BDD log MUST show 43/43 scenarios passing
- AND the job MUST NOT report the previous `SyntaxError: Unexpected identifier 'AuthWorld'` failure

### G6 scenario (surgical diff)

#### Scenario: The fix touches only configuration and the new verification script

- GIVEN the diff between `feat/fix-bdd-tsx-node22` and `develop`
- WHEN the file list is filtered by `\.steps\.ts$|cucumber\.mjs$|support/register\.ts$|\.feature$|world\.ts$|eslint-plugin-boundary|ci\.yml|tsconfig|pnpm-lock\.yaml`
- THEN the filtered list MUST be empty
- AND the remaining files MUST be exactly: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`
- AND `scripts/bdd/verify.sh` MUST be the only new file
- AND each `package.json` MUST contain exactly 1 changed line

---

## 7. Constraint Surface

### 7.1 Architectural boundaries (AGENTS.md §7 — enforced by ESLint)

- **`no-prisma-outside-core`**: Unaffected. No `.ts` source changes.
- **`no-schemas-outside-shared`**: Unaffected. No Zod schema changes.
- **`no-client-server-import`**: Unaffected. No client code changes.
- **`no-cross-module-import`**: Unaffected. No cross-feature imports changed.
- **`no-mojibake-in-docs`** (optional, slice-8 8.3): Unaffected. No `.md` files added.

### 7.2 Strict TDD (AGENTS.md §4)

This change is **config-only**. There is no production code to test, so the RED-first step is satisfied vacuously (the empirical reproduction in explore §5 already demonstrated the RED state — `SyntaxError: Unexpected identifier 'AuthWorld'` — and the GREEN state — 18/18 PASS). The empirical test IS the RED→GREEN evidence: the production change is one token, the verification is the BDD runner itself. No additional unit test, integration test, or fixture is required.

### 7.3 Atomic commits (AGENTS.md §5) and Conventional Commits (AGENTS.md §6)

- The 2 `package.json` lines + the new `scripts/bdd/verify.sh` MUST land as a SINGLE atomic commit (the change is a work unit: "make BDD pass on Node 22").
- Commit message type: `fix(bdd)`. Subject ≤72 chars, imperative, no trailing period. Body explains WHY (CI gate broken on Node 22 because cucumber's CJS `require()` bypasses tsx's ESM hook; switching to `tsx/cjs` matches the loader path).
- No `Co-Authored-By` line. No AI attribution. (Per AGENTS.md §6 and the persona's hard rule.)

### 7.4 Branch model (AGENTS.md §2)

- Work branch: `feat/fix-bdd-tsx-node22` cut from `develop` (NOT from `main`).
- `main` is immutable; no force-push, no delete, no amend of historic commits.
- `git revert <merge-sha>` cleanly reverses the entire PR.

### 7.5 Single source of truth (AGENTS.md §8)

- No duplication. The `bdd` script token lives in exactly one place per slice (`package.json:17`); no second config file overrides it.
- The new `scripts/bdd/verify.sh` is the single source of truth for the "run BDD on Node 22 locally" recipe.

### 7.6 Spanish mirror (AGENTS.md §13)

- This spec file (`openspec/changes/fix-bdd-tsx-node22/spec.md`) is intentionally NOT mirrored at spec-creation time (same precedent as `fix-api-nestjs-di`).
- The new `scripts/bdd/verify.sh` is a shell script, not a Markdown file — no mirror required.
- No English `.md` files are added under `openspec/` or `docs/` by this change.

### 7.7 CI workflow constraints

- BDD job uses Node 22.13.0 + pnpm 11.10.0 + Postgres 16-alpine. Timeout 30 min. The fix MUST work under these exact conditions.
- The fix MUST NOT alter `.github/workflows/ci.yml`.

---

## 8. Test Plan

| Goal | Test command | Expected outcome |
|------|--------------|------------------|
| G1 (auth BDD GREEN) | `pnpm --filter @features/auth bdd` on Node 22.13.0 | exit 0; 18/18 scenarios PASS; 101/101 steps PASS |
| G2 (transactions BDD GREEN) | `pnpm --filter @features/transactions bdd` on Node 22.13.0 | exit 0; 25/25 scenarios PASS |
| G3 (turbo BDD GREEN) | `pnpm turbo run bdd` on Node 22.13.0 | exit 0; both BDD packages pass |
| G4 (zero regression) | same as G1 + G2 combined | 43/43 scenarios executed; 0 skipped/pending/todo |
| G5 (CI gate flips) | GitHub Actions `BDD (Cucumber)` job | job reports `success` |
| G6 (surgical diff) | `git diff --name-only develop...feat/fix-bdd-tsx-node22` | exactly the 3 files listed in §6 G6 |

### Manual / non-CI verification steps

- `grep -n "tsx/esm\|tsx/cjs" libs/features/auth/server/package.json libs/features/transactions/server/package.json` — must show `tsx/cjs` only, no `tsx/esm`.
- `bash -n scripts/bdd/verify.sh` — must exit 0 (syntax check).
- `bash scripts/bdd/verify.sh` — on a machine with `nvm` or `asdf`, switches to Node 22 and runs `pnpm turbo run bdd` end-to-end.
- `pnpm lint:fixtures` — must still exit 0 (no ESLint changes; sanity check).
- `pnpm typecheck` — must still exit 0 (no `.ts` changes; sanity check).

---

## 9. Acceptance Criteria

> Binary pass/fail conditions for `sdd-verify`. Every criterion MUST be testable from a fresh `git checkout feat/fix-bdd-tsx-node22 && pnpm install`.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| AC1 | Auth `bdd` script uses `tsx/cjs` | `grep "tsx/cjs" libs/features/auth/server/package.json` returns ≥1 match |
| AC2 | Auth `bdd` script no longer uses `tsx/esm` | `grep "tsx/esm" libs/features/auth/server/package.json` returns no matches |
| AC3 | Auth `package.json` has exactly 1 changed line | `git diff develop -- libs/features/auth/server/package.json` shows exactly 1 changed line |
| AC4 | Transactions `bdd` script uses `tsx/cjs` | `grep "tsx/cjs" libs/features/transactions/server/package.json` returns ≥1 match |
| AC5 | Transactions `bdd` script no longer uses `tsx/esm` | `grep "tsx/esm" libs/features/transactions/server/package.json` returns no matches |
| AC6 | Transactions `package.json` has exactly 1 changed line | `git diff develop -- libs/features/transactions/server/package.json` shows exactly 1 changed line |
| AC7 | `scripts/bdd/verify.sh` exists | `ls scripts/bdd/verify.sh` succeeds |
| AC8 | `scripts/bdd/verify.sh` is executable | `test -x scripts/bdd/verify.sh` succeeds |
| AC9 | `scripts/bdd/verify.sh` passes syntax check | `bash -n scripts/bdd/verify.sh` exits 0 |
| AC10 | `scripts/bdd/verify.sh` runs `pnpm turbo run bdd` | `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` returns ≥1 match |
| AC11 | Auth BDD exits 0 | `pnpm --filter @features/auth bdd` on Node 22.13.0 exits 0; 18/18 PASS |
| AC12 | Transactions BDD exits 0 | `pnpm --filter @features/transactions bdd` on Node 22.13.0 exits 0; 25/25 PASS |
| AC13 | Turbo BDD exits 0 | `pnpm turbo run bdd` on Node 22.13.0 exits 0 |
| AC14 | No step-def modified | `git diff develop --name-only -- '*.steps.ts'` returns empty |
| AC15 | No `cucumber.mjs` modified | `git diff develop --name-only -- 'cucumber.mjs'` returns empty |
| AC16 | No `support/register.ts` modified | `git diff develop --name-only -- 'support/register.ts'` returns empty |
| AC17 | No `.feature` file modified | `git diff develop --name-only -- '*.feature'` returns empty |
| AC18 | No `pnpm-lock.yaml` modified | `git diff develop --name-only -- pnpm-lock.yaml` returns empty |
| AC19 | No ESLint config or boundary plugin modified | `git diff develop --name-only -- 'eslint.config*' 'tools/eslint-plugin-boundary/**'` returns empty |
| AC20 | No CI workflow modified | `git diff develop --name-only -- '.github/workflows/ci.yml'` returns empty |
| AC21 | Diff is exactly the 3 expected files | `git diff develop --name-only` lists exactly: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh` |
| AC22 | CI job reports success | GitHub Actions `BDD (Cucumber)` job on the PR reports `success` |
| AC23 | No `Co-Authored-By` in commit | `git log feat/fix-bdd-tsx-node22 --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC24 | Single atomic commit | `git log --oneline develop..feat/fix-bdd-tsx-node22` shows exactly 1 commit |

---

## 10. Out of Scope

(Mirrored from proposal §2.2 + AGENTS.md §11; non-goals above are operational, this section is the formal review check.)

1. Anything in AGENTS.md §11.
2. Switching Cucumber from `require:` to `import:` (Shape B).
3. Rewriting `support/register.ts` as CJS (Shape C).
4. Replacing tsx with `@swc-node/register` (Shape D).
5. Adding any new dev dependency.
6. Editing any `.ts` source file (world.ts, .steps.ts, support/register.ts).
7. Editing any `.feature` file or `cucumber.mjs`.
8. Editing `.github/workflows/ci.yml`.
9. Pinning or upgrading tsx.
10. Changing the Node version baseline.
11. Editing `tsconfig.base.json`, `apps/web/**`, `apps/api/**`.
12. Editing ESLint config or boundary plugin.
13. Adding a new BDD scenario, unit test, or e2e test.
14. Adding `bdd:debug` script (Q2 rejected).
15. Adding `--bail` to the CI bdd job (Q3 rejected).
16. Writing ADR 0009 (Q1 rejected — config tweak of this size doesn't warrant an ADR; same precedent as `fix-api-nestjs-di` for Q1 only applies when the change introduces a new decision; this change documents itself inline).
17. Migrating `gastos-personales/` to the vertical-slicing model.

---

## 11. Open Questions — RESOLVED

The proposal deferred 4 questions to the spec phase. They are now resolved:

### Q1 — ADR 0009 for the loader hook choice

**Resolved**: **NO ADR.**

Rationale: the change is a one-token-per-line swap between two official tsx entry points (`tsx/esm` ↔ `tsx/cjs`) documented at <https://tsx.is/getting-started>. An ADR for a config tweak of this size is bureaucratic overhead. The proposal itself, this spec, and the PR description together provide enough context for future maintainers. The fix-api-nestjs-di precedent (where ADR 0008 WAS written) applies to a different situation: that change introduced a new ESLint rule and a new convention (`_ServiceAnchor`) that genuinely needed documenting. This change restores expected behaviour via an already-documented official hook.

### Q2 — `bdd:debug` script with `--inspect`

**Resolved**: **NO `bdd:debug` script.**

Rationale: scope creep. The existing `bdd` script is sufficient for local debugging once it works on Node 22. A separate debug script with `--inspect` can be added in a future change if contributors need it.

### Q3 — CI `--bail` flag for fast-fail on first slice failure

**Resolved**: **NO `--bail` flag.**

Rationale: out of scope. The BDD job already runs all slices and reports a single exit code; fast-fail semantics are a separate CI-tuning concern. The fix is independent of how the CI reports failures.

### Q4 — New verification script for local BDD-on-Node-22 reproduction

**Resolved**: **YES** — add `scripts/bdd/verify.sh` (R10), optionally wired as `pnpm bdd:verify` (R11).

Rationale: cheap insurance against future regression. The bug was hard to diagnose because there was no documented "how to reproduce on Node 22" recipe. A 30-line shell script that (a) switches to Node 22 if a version manager is available, (b) logs the Node + tsx versions, (c) runs `pnpm turbo run bdd`, and (d) propagates the exit code is the minimum useful artifact. It runs in <60 seconds locally and gives future maintainers a one-liner to verify the BDD gate. Total added LOC: ~30 (well under the 400-line budget).

---

## 12. Traceability

Goal → Requirement → Scenario → Test command:

| Goal | Requirements | Scenarios | Test command |
|------|-------------|-----------|--------------|
| G1 | R1, R3, R6 | G1.1 (auth BDD GREEN) | `pnpm --filter @features/auth bdd` |
| G2 | R2, R3, R6 | G2.1 (transactions BDD GREEN) | `pnpm --filter @features/transactions bdd` |
| G3 | R1, R2, R5 | G3.1 (full turbo BDD) | `pnpm turbo run bdd` |
| G4 | R6, R7, R8 | G4.1 (zero regression) | covered by G1 + G2 + G3 |
| G5 | R5, R12 | G5.1 (CI gate flips) | GitHub Actions `BDD (Cucumber)` job |
| G6 | R4, R7, R8, R9, R10 | G6.1 (surgical diff) | `git diff --name-only develop...feat/fix-bdd-tsx-node22` |

### Acceptance criterion ↔ requirement matrix

| Requirement | Acceptance criteria |
|-------------|---------------------|
| R1 | AC1, AC2, AC3 |
| R2 | AC4, AC5, AC6 |
| R3 | AC11, AC12 (passes on Node 22; the same `tsx/cjs` hook contract applies to Node 23.x) |
| R4 | AC3, AC6, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21 |
| R5 | AC13 |
| R6 | AC11, AC12, AC13 |
| R7 | AC14 |
| R8 | AC15, AC16 |
| R9 | AC18, AC19 (no `pnpm-lock.yaml` change; no ESLint dep change) |
| R10 | AC7, AC8, AC9, AC10 |
| R11 | (recommended, not gated) — manual check of `package.json` |
| R12 | (PR description convention; not directly gated by AC) |

### Risk ↔ requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (`tsx/cjs` differs from `tsx/esm` for top-level await / async module loading) | R3 + G1 scenario — the empirical test on Node 22.14.0 already showed 18/18 PASS; the BDD scenarios don't use top-level await (verified in explore §7 R1). |
| R2 (`tsx/cjs` may not be available in older tsx versions) | R9 — `tsx/cjs` is shipped since tsx 4.16.x; the `^4.23.0` range satisfies `>=4.16.0`. |
| R3 (future tsx major removes `tsx/cjs`) | R9 — the exports map has declared both hooks with no deprecation note; if removed, the fix would mirror today's fix (same shape, different token). |
| R4 (regresses local Node 23.x dev environments) | R3 — `tsx/cjs` hooks into the CJS loader chain regardless of Node major. |
| R5 (a previous admin-merge workaround assumes old `tsx/esm`) | R7 + R8 — no step-def or `register.ts` is touched; the previous workarounds stay valid (they only added bridging code, not `tsx` configuration overrides). |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
- **Explore brief**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`)
- **Smoking-gun error**: `SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule` (Node 22.13.0 / 22.14.0)
- **Failing CI run (now fixed)**: `29288016689` (cited in explore §10)
- **tsx exports map**: `node_modules/tsx/package.json` `exports` field declares both `tsx/esm` and `tsx/cjs` since 4.16.x (explore §4, §5)
- **Loader chain anatomy**: explore §3 (`@cucumber/cucumber/lib/try_require.js:8` → CJS `require()` → `Module._compile`)
- **Empirical test**: explore §5 and §10 — `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s on Node 22.14.0
- **Affected slice `package.json` files**:
  - `libs/features/auth/server/package.json:17`
  - `libs/features/transactions/server/package.json:17`
- **Untouched BDD surface** (per explore §6): all 9 `.feature` files, all 5 `.steps.ts` files, both `world.ts` files, both `support/register.ts` files, both `cucumber.mjs` files
- **CI workflow**: `.github/workflows/ci.yml` `BDD (Cucumber)` job uses Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine
- **Precedent**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/spec.md` (spec format reference; this spec mirrors its 12-section structure)
- **Project conventions**: AGENTS.md §2 (branch), §4 (strict TDD — config-only fix, vacuously RED→GREEN via BDD runner), §5 (atomic commits — single work-unit commit), §6 (Conventional Commits — `fix(bdd): …`), §7 (boundary plugin — no rule edits), §11 (out-of-scope — none touched), §12 (pre-commit checklist — single-purpose, rollback-trivial, ESLint untouched), §13 (Spanish mirror — none required, no `.md` added)

---

**Next phase**: `design` (sdd-design will produce the exact diff hunks for the two `package.json` lines, the full body of `scripts/bdd/verify.sh`, and the verification commands — translating this WHAT into HOW).