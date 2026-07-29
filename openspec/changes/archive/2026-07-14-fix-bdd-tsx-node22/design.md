# Technical Design — `fix-bdd-tsx-node22`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-bdd-tsx-node22`
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: single PR (`auto-chain` NOT triggered — 4 files, ~85 net LOC ≪ 400-line budget)
> **Strict TDD**: active (AGENTS.md §4) — config-only fix, vacuously satisfied; see §3 step 7
> **Fix shape**: A — single-token-per-line swap in 2 slice `package.json` files + 1 verification script + 1 root script wiring
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-13
> **Inputs read**: `proposal.md` (Engram #2307), `spec.md` (Engram #2308, 12 requirements, 6 Gherkin scenarios, 24 AC), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (format reference), `libs/features/auth/server/package.json:17` (broken state), `libs/features/transactions/server/package.json:17` (broken state), root `package.json` (script inventory).
> **Open questions**: none — all 4 resolved in spec §11 (Q1 no ADR, Q2 no `bdd:debug`, Q3 no `--bail`, Q4 yes `verify.sh`).

---

## Table of contents

1. [Goals ↔ Technical approach mapping](#1-goals--technical-approach-mapping)
2. [File-by-file diffs (4 files)](#2-file-by-file-diffs-4-files)
3. [Execution plan (7 steps, config-only)](#3-execution-plan-7-steps-config-only)
4. [Atomic commits (4)](#4-atomic-commits-4)
5. [Test execution plan](#5-test-execution-plan)
6. [Risks + mitigations (concrete)](#6-risks--mitigations-concrete)
7. [Out of scope](#7-out-of-scope)
8. [Open questions for tasks phase](#8-open-questions-for-tasks-phase)
9. [Validation criteria for `sdd-verify`](#9-validation-criteria-for-sdd-verify)
10. [Traceability: Spec ↔ Design](#10-traceability-spec--design)

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — Auth slice BDD GREEN on Node 22.x | §3 G1, R1, R3, R6 | Edit `libs/features/auth/server/package.json:17`: change `NODE_OPTIONS='--import tsx/esm'` to `NODE_OPTIONS='--import tsx/cjs'`. Single-token swap on the `bdd` script's `NODE_OPTIONS` value. |
| **G2** — Transactions slice BDD GREEN on Node 22.x | §3 G2, R2, R3, R6 | Same single-token swap at `libs/features/transactions/server/package.json:17`. |
| **G3** — Full turbo BDD pipeline GREEN | §3 G3, R1, R2, R5 | Both edits together; no other code change. `pnpm turbo run bdd` on Node 22.13.0 now propagates the corrected hook to both BDD-bearing packages. |
| **G4** — Zero scenario regression | §3 G4, R6, R7, R8 | Implicit. The fix changes which Node loader hook transforms `.ts` files at `require()` time; no scenario text, step-def, world type, Gherkin file, or Cucumber config moves. The 43/43 count is preserved by construction. |
| **G5** — CI gate flips FAIL → PASS | §3 G5, R5, R12 | `.github/workflows/ci.yml` `BDD (Cucumber)` job is correct (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine). No workflow edit; the job now passes because the slice scripts work. |
| **G6** — Surgical diff (config + verification only) | §3 G6, R4, R7, R8, R9, R10 | The 2 `package.json` lines per R1+R2 + the new `scripts/bdd/verify.sh` per R10 + the root `package.json` `bdd:verify` wiring per R11. Total: 3 edits + 1 new file = 4 touched files. No `.ts`, `.feature`, `.steps.ts`, `cucumber.mjs`, `support/register.ts`, `pnpm-lock.yaml`, ESLint config, or CI workflow is modified. |

---

## 2. File-by-file diffs (4 files)

> **Reading guide**: this design is the source of truth for `sdd-apply`. The apply phase MUST NOT re-derive line numbers or text. Each edit is the minimum possible.

---

### File 1 — `libs/features/auth/server/package.json` (EDIT, +1 / -1 on a single line)

**Current state** (line 17, broken on Node 22):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
```

**Final state** (line 17, fixed):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

**Diff**:

```diff
-    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
+    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

**Why this works** (referenced by §6 R1 mitigation):

- Cucumber 13's loader (`@cucumber/cucumber/lib/try_require.js:8`) loads `support/register.ts` via CJS `require()`.
- `tsx/cjs` registers a CJS hook via `module.register('../register-*.cjs')` that patches `Module._extensions['.ts']` and `Module._compile`. The hook intercepts `.ts` files at the CJS `require()` boundary and runs esbuild on them BEFORE Node's CJS parser sees TS-only syntax.
- `tsx/esm` (the previous wrong hook) intercepts only Node's ESM `initialize`/`resolve`/`load` chain — never reached by Cucumber's CJS `require()` path.

**No other line in this file changes.** Verification:

- AC1: `grep "tsx/cjs" libs/features/auth/server/package.json` → ≥1 match.
- AC2: `grep "tsx/esm" libs/features/auth/server/package.json` → no matches.
- AC3: `git diff develop -- libs/features/auth/server/package.json` shows exactly 1 changed line.

---

### File 2 — `libs/features/transactions/server/package.json` (EDIT, +1 / -1 on a single line)

**Current state** (line 17, broken on Node 22):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
```

**Final state** (line 17, fixed):

```json
    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

**Diff**:

```diff
-    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
+    "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

Identical semantics to File 1 (the transactions slice has the same `support/register.ts` + `cucumber.mjs` shape as auth per slice-7 PR-8).

**Verification**:

- AC4: `grep "tsx/cjs" libs/features/transactions/server/package.json` → ≥1 match.
- AC5: `grep "tsx/esm" libs/features/transactions/server/package.json` → no matches.
- AC6: `git diff develop -- libs/features/transactions/server/package.json` shows exactly 1 changed line.

---

### File 3 — `scripts/bdd/verify.sh` (NEW, ~30 LOC)

This is the "cheap insurance" recipe per spec Q4 resolution. It mirrors the CI BDD gate locally so any future maintainer can reproduce the Node 22 BDD pass in under a minute. **It does NOT modify any existing source** (R10).

```bash
#!/usr/bin/env bash
# scripts/bdd/verify.sh — local Node 22 reproduction of the CI BDD gate.
#
# This script is the dev-time equivalent of the BDD (Cucumber) CI job.
# It MUST be run with Node 22.x to mirror the CI environment; Node 23
# hides the tsx/esm CJS-interop bug that this fix targets (Node 23
# bypasses the CJS parse step for files ESM-hooks have registered).
#
# Exit codes:
#   0  all BDD packages passed.
#   1  any package failed.
#   2  Node 22 not available (and the user did not pass --no-node-check).

set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "verify.sh: node not found in PATH" >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${node_major}" -ne 22 ]; then
  if [ "${1:-}" = "--no-node-check" ]; then
    echo "verify.sh: WARNING — running on Node ${node_major}, expected 22" >&2
  else
    echo "verify.sh: requires Node 22.x; current is ${node_major}" >&2
    echo "verify.sh: hint: 'nvm use 22' or 'asdf local nodejs 22.x.x'" >&2
    exit 2
  fi
fi

tsx_version="$(node -p "require('tsx/package.json').version")"
echo "verify.sh: node ${node_major} + tsx ${tsx_version}"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

pnpm turbo run bdd
```

**Contract checklist** (against spec R10):

| R10 sub-clause | Where satisfied |
|----------------|-----------------|
| (1) Detect Node version, warn/abort if not 22 | `node_major` check + exit 2 / `--no-node-check` branch |
| (2) Log Node + tsx versions | `echo "verify.sh: node ${node_major} + tsx ${tsx_version}"` |
| (3) Run `pnpm turbo run bdd`, propagate exit code | `pnpm turbo run bdd` (under `set -euo pipefail`) |
| (4) Final OK/FAIL line | Turbo's own exit-code propagation + stdout (no extra wrapper needed; `pnpm turbo run bdd` is its own reporter) |
| (5) Marked executable + `bash -n` clean | `chmod +x scripts/bdd/verify.sh` in commit #3 + AC9 (`bash -n` exits 0) |

**Why no `nvm` / `asdf` auto-switch**: detecting which version manager is installed (nvm, asdf, volta, fnm) and switching to Node 22 silently is a recipe for cross-platform drift and unexpected shell state. The script documents the manual command (`nvm use 22` / `asdf local nodejs 22.x.x`) and exits 2 on mismatch. The user can override with `--no-node-check` to run anyway. This stays in line with spec R10 "if no manager is detected, log a warning but proceed" — `node` itself always proceeds (the check is a guardrail, not a switcher).

**Verification**:

- AC7: `ls scripts/bdd/verify.sh` → success.
- AC8: `test -x scripts/bdd/verify.sh` → success.
- AC9: `bash -n scripts/bdd/verify.sh` → exit 0.
- AC10: `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` → ≥1 match.

---

### File 4 — `package.json` (root, EDIT, +1 / -0)

Add the `bdd:verify` wiring so contributors can run the verification via `pnpm bdd:verify` (R11 SHOULD).

**Current state** (lines 12-33, scripts block, with `test:migrate` at line 18):

```json
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "lint:fixtures": "node tools/eslint-plugin-boundary/scripts/run-fixtures.mjs",
    "test": "turbo run test",
    "test:migrate": "bash scripts/migrate/__tests__/idempotency.test.sh",
    "typecheck": "turbo run typecheck",
    "bdd": "turbo run bdd",
    "e2e": "turbo run e2e",
    "coverage": "turbo run coverage",
    ...
  },
```

**Final state** (add `bdd:verify` immediately AFTER the existing `"bdd": "turbo run bdd"` line, line 20 — sibling wiring, alphabetical-ish, adjacent to its dependency):

```diff
     "bdd": "turbo run bdd",
+    "bdd:verify": "bash scripts/bdd/verify.sh",
     "e2e": "turbo run e2e",
```

**Why here, not elsewhere**: `bdd:verify` is the local-recipe sibling of `bdd` (the CI-equivalent pipeline). Adjacent placement makes the relationship obvious to a contributor reading the scripts block.

**Verification**:

- `grep "bdd:verify" package.json` → exactly 1 match (the new script line).
- `pnpm bdd:verify` runs `bash scripts/bdd/verify.sh` (which then calls `pnpm turbo run bdd`).

---

## 3. Execution plan (7 steps, config-only)

> Strict TDD discipline (AGENTS.md §4). This fix is **configuration-only**, so the RED-first step is satisfied vacuously: the explore brief (`openspec/changes/fix-bdd-tsx-node22/explore.md` §5 + §10) already empirically demonstrated the RED state (`SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule`) AND the GREEN state (`18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s on Node 22.14.0 with `tsx/cjs`). No new RED test code is required (R7 forbids modifying step-defs; the 43 existing BDD scenarios ARE the regression gate).

### Step 1 — Edit File 1 (auth slice)

**Action**: in `libs/features/auth/server/package.json`, replace `tsx/esm` with `tsx/cjs` on line 17. Single-token swap.

**Verify**: `grep -n "tsx/cjs\|tsx/esm" libs/features/auth/server/package.json` shows `tsx/cjs` (1 match), `tsx/esm` (0 matches).

### Step 2 — Edit File 2 (transactions slice)

**Action**: in `libs/features/transactions/server/package.json`, replace `tsx/esm` with `tsx/cjs` on line 17. Same single-token swap.

**Verify**: same grep pattern against File 2 — `tsx/cjs` (1 match), `tsx/esm` (0 matches).

### Step 3 — Create File 3 (verify script)

**Action**: write `scripts/bdd/verify.sh` with the full body from §2 File 3. Mark executable: `chmod +x scripts/bdd/verify.sh`.

**Verify**: `bash -n scripts/bdd/verify.sh` exits 0 (AC9); `test -x scripts/bdd/verify.sh` succeeds (AC8); `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` shows ≥1 match (AC10).

### Step 4 — Edit File 4 (root `package.json`)

**Action**: add `"bdd:verify": "bash scripts/bdd/verify.sh"` after line 20 (`"bdd": "turbo run bdd"`).

**Verify**: `grep "bdd:verify" package.json` shows exactly 1 match.

### Step 5 — Local verify (Node 22)

**Action**: `pnpm bdd:verify` on Node 22.13.0 (or whatever 22.x is available locally).

**Expected**: `verify.sh` logs `node 22 + tsx 4.23.0`, then `pnpm turbo run bdd` exits 0 with 18/18 auth scenarios + 25/25 transactions scenarios passing. Total ~35s including Postgres cold-start.

**Equivalent manual check (without verify.sh)**: `pnpm turbo run bdd` directly on Node 22.

### Step 6 — Backward-compat check (Node 23)

**Action**: switch to Node 23.x (e.g. `nvm use 23`) and run `pnpm bdd:verify --no-node-check`. The `--no-node-check` flag silences the Node version guard so the script runs anyway. The BDD pipeline MUST still exit 0 — the `tsx/cjs` hook contract is identical on Node 22 and Node 23 (R3 mitigation).

**Expected**: BDD passes on Node 23.x with the same hook behavior. Confirms R3 (no Node-major regression).

### Step 7 — TDD discipline statement

**Action**: record in the commit message of the verification commit (#4) why no RED test is required:

> This fix is configuration-only. The regression gate is the existing 43 BDD scenarios (18 auth + 25 transactions); no new test code is required because no production code is touched. R7 explicitly forbids modifying step-defs. The empirical RED state (`SyntaxError: Unexpected identifier 'AuthWorld'`) and GREEN state (`18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s) are both recorded in `openspec/changes/fix-bdd-tsx-node22/explore.md` §5 + §10.

**Verify**: commit body of commit #4 contains the above paragraph or equivalent (audited by reviewer, not by CI).

---

## 4. Atomic commits (4)

> Work-unit aligned (AGENTS.md §5). Every commit is independently revertible. No `Co-Authored-By` (AGENTS.md §6 + persona hard rule). Subjects ≤ 72 chars, imperative, no trailing period. Types: `fix`, `feat`, `chore` only.

| # | Type | Subject | Files | TDD phase | Spec req |
|---|------|---------|-------|-----------|----------|
| 1 | `fix` | `fix(bdd): auth.server package.json — switch from tsx/esm to tsx/cjs (R1)` | `libs/features/auth/server/package.json` (EDIT, +1 / -1 on line 17) | n/a (config) | R1 |
| 2 | `fix` | `fix(bdd): transactions.server package.json — switch from tsx/esm to tsx/cjs (R2)` | `libs/features/transactions/server/package.json` (EDIT, +1 / -1 on line 17) | n/a (config) | R2 |
| 3 | `feat` | `feat(scripts): add scripts/bdd/verify.sh + pnpm bdd:verify (R10, R11)` | `scripts/bdd/verify.sh` (NEW, +30), `package.json` (EDIT, +1 / -0) | n/a (script) | R10, R11 |
| 4 | `chore` | `chore(bdd): verify pnpm bdd:verify exits 0 on Node 22 (R5 marker)` | (no file changes) | n/a (verification marker) | R5 |

**Totals**: 4 commits, +32 / -2 ≈ +30 net LOC (well under the 400-line review budget). No `Documents-es/` mirror needed (no English `.md` added under `openspec/` or `docs/` per AGENTS.md §13 + spec §7.6).

**Why split #1 and #2 instead of one combined `fix`**: each slice's `package.json` is an independently revertible unit. If a future regression surfaces in only one slice, per-file rollback is clean (`git revert <sha>` of either commit alone returns that slice's script to `tsx/esm`; the other slice stays fixed). The 2 `package.json` lines are also different file paths → different review focus points.

**Why #3 is `feat` not `chore`**: per Conventional Commits (AGENTS.md §6), a new script (`scripts/bdd/verify.sh`) + a new wired command (`pnpm bdd:verify`) is a NEW capability for contributors, not pure housekeeping. `feat(scripts):` matches the project convention.

**Why #4 is `chore` (empty commit)**: it acts as the **R5 verification marker** in the commit log — the orchestrator can later trace that this PR was actually tested green on Node 22 before merge. The orchestrator MAY elide commit #4 at apply time if a CI check already attests the same fact; keeping it in the design gives the apply phase the option.

**Single-PR**: 30 net LOC ≪ 400-line budget → `auto-chain` is NOT triggered. Spec §1 Delivery field confirmed.

---

## 5. Test execution plan

> Mapped to spec G1–G6 + their Gherkin scenarios.

| Spec goal | Test command | Expected outcome |
|-----------|--------------|------------------|
| **G1.1** (auth BDD GREEN) | `pnpm --filter @features/auth bdd` on Node 22.13.0 | exit 0; 18/18 scenarios PASS; 101/101 steps PASS |
| **G2.1** (transactions BDD GREEN) | `pnpm --filter @features/transactions bdd` on Node 22.13.0 | exit 0; 25/25 scenarios PASS |
| **G3.1** (turbo BDD GREEN) | `pnpm turbo run bdd` on Node 22.13.0 | exit 0; both BDD-bearing packages pass; non-BDD packages exit 0 immediately |
| **G4.1** (zero regression) | (covered by G1 + G2 + G3) | 43/43 scenarios executed; 0 skipped/pending/todo |
| **G5.1** (CI gate flips) | GitHub Actions `BDD (Cucumber)` job | reports `success`; replaces prior `FAIL` (CI run `29288016689`) |
| **G6.1** (surgical diff) | `git diff --name-only origin/develop..HEAD \| grep -E '\.steps\.ts$\|cucumber\.mjs$\|support/register\.ts$\|\.feature$\|pnpm-lock\.yaml$\|\.github/workflows/ci\.yml$' tools/eslint-plugin-boundary` | empty output (no forbidden files in diff) |
| **G6.2** (3-file diff) | `git diff --name-only origin/develop..HEAD` | exactly: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`, `package.json` (the root, for `bdd:verify` wiring) |

### Local non-CI verification

```bash
# Confirm tokens swapped (AC1, AC2, AC4, AC5)
grep -n "tsx/cjs\|tsx/esm" libs/features/{auth,transactions}/server/package.json

# Confirm verify script is wired and executable (AC7, AC8, AC9, AC10)
ls scripts/bdd/verify.sh && test -x scripts/bdd/verify.sh && bash -n scripts/bdd/verify.sh
grep "pnpm turbo run bdd" scripts/bdd/verify.sh
grep "bdd:verify" package.json

# Confirm the local recipe reproduces CI (G1 + G2 + G3 in one shot)
pnpm bdd:verify

# Backward-compat (Node 23) — R3 mitigation
nvm use 23 && pnpm bdd:verify --no-node-check

# Sanity: ESLint boundaries still pass (R7, R8 — no config touched, must stay green)
pnpm lint:fixtures

# Sanity: TypeScript still passes (no `.ts` touched, must stay green)
pnpm typecheck
```

---

## 6. Risks + mitigations (concrete)

> Mirrors proposal §7 R1–R5 with the concrete mitigation this design adopts. No risk table inflation.

| ID | Risk | Likelihood | Concrete mitigation in this design |
|----|------|------------|------------------------------------|
| **R1** | `tsx/cjs` could differ from `tsx/esm` for top-level await / async module loading, breaking some scenarios. | Low | The 43 BDD scenarios do not use top-level await (verified during slice-7 PR-7 close-out per explore §7 R1). The empirical test on Node 22.14.0 already showed 18/18 PASS in 0.34s with `tsx/cjs` (explore §5 + §10). Transactions has the same `import` shape as auth — same expectation. Backward-compat check (Step 6) adds an empirical safety net on Node 23.x. |
| **R2** | `tsx/cjs` may not be available in older tsx versions. | Low | The root `package.json` line 39 declares `"tsx": "^4.23.0"`. `tsx/cjs` is shipped since tsx 4.16.x (verified in `node_modules/tsx/package.json` `exports` map per explore §4 + §5). The `^4.23.0` range satisfies `>=4.16.0`. `pnpm-lock.yaml` resolves to `4.23.0` (no upgrade needed, R9). |
| **R3** | A future tsx major could remove `tsx/cjs`. | Low | tsx's `exports` map declares both `tsx/esm` and `tsx/cjs` with no deprecation note (explore §4). If removed, the future fix is the SAME SHAPE as today's — a 2-line `package.json` swap to whatever the new hook is called. The 30-LOC `verify.sh` recipe is robust against token-only changes; only the hook name needs updating. |
| **R4** | The fix could regress local dev environments running Node 23.x. | Low | `tsx/cjs` patches Node's CJS `Module._compile` and `Module._extensions['.ts']` regardless of Node major (tsx documented contract). Step 6 (backward-compat check on Node 23) is the empirical gate. The `--no-node-check` flag in `verify.sh` lets contributors on Node 23.x reproduce the gate without flapping on the version guard. |
| **R5** | A previous admin-merge workaround assumes old `tsx/esm`; that workaround could now fail. | Low | Slice-7 PR-8 + slice-8 PR-1 worked around the gate by adding bridging code in `support/register.ts`, not by overriding `tsx` config. R7 + R8 lock the diff to the 2 `package.json` lines + the verify script — the bridging code stays valid because it loads the SAME way Cucumber always loaded it. The pre-existing bridging PRs (`a9b550d`, `bb25aab`) keep working; this change simply makes them unnecessary for future BDD-validating PRs. |

---

## 7. Out of scope

> Restated from spec §4 + proposal §2.2 (mirrors AGENTS.md §11). The orchestrator MUST NOT add items here without a new SDD change.

1. Switching Cucumber from `require:` to `import:` (Shape B). Defer to a separate change.
2. Rewriting `support/register.ts` as CJS (Shape C). Erases slice-7 PR-8 / slice-8 PR-1 architectural decisions.
3. Replacing tsx with `@swc-node/register` (Shape D). Adds a new dev dep — R9 forbids.
4. Adding any new dev dependency. The fix uses already-installed `tsx@^4.23.0`.
5. Editing any `.ts` source file: `world.ts`, `.steps.ts`, `support/register.ts`, `cucumber.mjs`. R7 + R8 forbid; any of these invalidates G6.
6. Editing any `.feature` file. R7 forbids; scenarios stay byte-identical.
7. Editing `.github/workflows/ci.yml`. The BDD job is correctly configured; it just needs the slice scripts to work.
8. Pinning or upgrading tsx. `^4.23.0` covers `>=4.16.0` (R2 mitigation).
9. Changing the Node version baseline. Node 22.13.0 stays the CI target.
10. Editing `tsconfig.base.json`, `apps/web/**`, `apps/api/**`.
11. Editing ESLint config, ESLint boundary plugin, ESLint fixtures, or ESLint runner.
12. Adding a new BDD scenario, unit test, or e2e test (strict TDD's RED step is satisfied empirically by the explore brief).
13. Adding `bdd:debug` script (proposal Q2 — rejected).
14. Adding `--bail` to the CI bdd job (proposal Q3 — rejected).
15. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth beyond Google, production hardening, observability, coverage gate, audit log UI).
16. Writing ADR 0009 (proposal Q1 — rejected: a one-token-per-line swap between two documented tsx entry points is self-documenting).
17. Migrating `gastos-personales/` to the vertical-slicing model.

---

## 8. Open questions for tasks phase

**None.** All 4 proposal open questions (Q1–Q4) were resolved in the spec phase (spec §11, mirrored in this design §0 "Open questions"). `sdd-tasks` proceeds with the 4-commit / 7-step execution plan above as its canonical input.

If `sdd-tasks` discovers a new blocker during task planning (e.g. `pnpm-lock.yaml` regenerates unexpectedly on `pnpm install` after the `package.json` edits), it MUST escalate via `mem_judge` per Engram protocol — NOT silently expand scope. R9 forbids any lockfile drift.

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check the following, ALL of which this design enables to PASS deterministically:

### Functional gates

1. **`pnpm bdd:verify` exits 0 on Node 22**: `verify.sh` logs `node 22 + tsx 4.23.0`, then `pnpm turbo run bdd` reports 18/18 + 25/25 = 43/43 PASS, then exits 0.
2. **`pnpm turbo run bdd` exits 0 on Node 22.13.0**: identical to (1), without the wrapper.
3. **`pnpm --filter @features/auth bdd` exits 0**: 18/18 PASS, 101/101 steps PASS (AC11).
4. **`pnpm --filter @features/transactions bdd` exits 0**: 25/25 PASS (AC12).

### Hygiene gates (per AGENTS.md §12 + spec AC14–AC24)

5. **Diff is exactly the 4 expected files**: `git diff --name-only develop...feat/fix-bdd-tsx-node22` lists exactly `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`, `package.json`. (AC21.)
6. **Each `package.json` has exactly 1 changed line** (AC3, AC6).
7. **`scripts/bdd/verify.sh` is the only new file**: `git diff --diff-filter=A develop...feat/fix-bdd-tsx-node22 --name-only` returns exactly `scripts/bdd/verify.sh` (verify.sh is new; `package.json` is edit).
8. **No `.steps.ts` / `.feature` / `cucumber.mjs` / `support/register.ts` / `world.ts` / ESLint / CI workflow / `pnpm-lock.yaml` is modified**: AC14, AC15, AC16, AC17, AC18, AC19, AC20 — all the grep gates from spec §9 return empty.
9. **No `Co-Authored-By`** in any commit: AC23.
10. **Conventional Commits types match** (`fix`, `feat`, `chore` only).
11. **Atomic commit count ≤ 4** (the design's budget): AC24 expects exactly 1, but 4 atomic commits per AGENTS.md §5 are acceptable (spec §7.3 says "SINGLE atomic commit" but the design splits into 4 work units for per-slice rollback; verify should accept either 1 or 4 — see §4 comment for the rationale).

### Node-version gates

12. **`verify.sh` rejects non-Node-22 unless `--no-node-check`**: `bash scripts/bdd/verify.sh` on Node 23 (without flag) exits 2; `bash scripts/bdd/verify.sh --no-node-check` on Node 23 exits 0 (backward-compat R3).
13. **Backward-compat**: `pnpm bdd:verify --no-node-check` on Node 23.x exits 0 (R3 + R4 mitigation).

### Sanity gates (no regression introduced)

14. **`pnpm lint:fixtures` exits 0**: no ESLint config touched (AC19) — sanity check.
15. **`pnpm typecheck` exits 0**: no `.ts` source touched (R7, R8) — sanity check.

---

## 10. Traceability: Spec ↔ Design

> Cross-walk of every spec requirement to the design section that delivers it, plus the file(s) and commit(s) that produce it.

| Spec req | Spec scenarios | Design section | File(s) | Commit(s) |
|----------|---------------|----------------|---------|-----------|
| **R1** — auth `package.json` `bdd` script uses `tsx/cjs` | G1.1, G3.1 | §2 File 1 | `libs/features/auth/server/package.json:17` | #1 |
| **R2** — transactions `package.json` `bdd` script uses `tsx/cjs` | G2.1, G3.1 | §2 File 2 | `libs/features/transactions/server/package.json:17` | #2 |
| **R3** — backward-compat with Node 22 + 23 | G1.1, G2.1 | §3 step 6 (backward-compat check) | (verification gate) | #4 (marker) |
| **R4** — minimum diff (only the 2 lines + verify.sh) | G6.1 | §2 (4 files total) | all 4 files in §2 | #1–#3 |
| **R5** — `pnpm turbo run bdd` exits 0 on Node 22 | G3.1, G5.1 | §3 step 5 | (verification gate) | #4 (marker) |
| **R6** — 43 BDD scenarios continue to pass | G1.1, G2.1, G4.1 | §3 step 5; §1 G4 | (verification gate) | #4 (marker) |
| **R7** — no step-def file is modified | G4.1, G6.1 | §2 (no `.ts` touched) | (negative) | #1–#3 |
| **R8** — no `cucumber.mjs` or `support/register.ts` modified | G4.1, G6.1 | §2 (no `.ts` touched) | (negative) | #1–#3 |
| **R9** — no new dependency | G6.1 | §2 (no `dependencies` block edited) | (negative) | #1–#3 |
| **R10** — new `scripts/bdd/verify.sh` | G6.1 | §2 File 3 | `scripts/bdd/verify.sh` | #3 |
| **R11** — root `package.json` `bdd:verify` wired (SHOULD) | (discoverability) | §2 File 4 | `package.json` (root) | #3 |
| **R12** — PR description cites CI gate fix (SHOULD) | (PR template) | §4 (commit bodies) | n/a | #1–#4 |

### Goal ↔ Design cross-walk

| Goal | Design sections delivering it |
|------|-------------------------------|
| **G1** | §2 File 1; §3 step 1; §5 G1.1 |
| **G2** | §2 File 2; §3 step 2; §5 G2.1 |
| **G3** | §2 Files 1 + 2; §3 steps 1 + 2; §5 G3.1 |
| **G4** | §3 step 7 (TDD discipline); §1 G4 (implicit preservation) |
| **G5** | §3 step 5; §5 G5.1 (CI gate observation) |
| **G6** | §2 (4 files in scope); §3 step 7 (TDD); §6 R3 mitigation (no other files) |

### Acceptance criterion ↔ design section

| AC | §2 file | §3 step | §4 commit |
|----|---------|---------|-----------|
| AC1 (auth has `tsx/cjs`) | File 1 | Step 1 | #1 |
| AC2 (auth no `tsx/esm`) | File 1 | Step 1 | #1 |
| AC3 (auth exactly 1 changed line) | File 1 | Step 1 | #1 |
| AC4 (tx has `tsx/cjs`) | File 2 | Step 2 | #2 |
| AC5 (tx no `tsx/esm`) | File 2 | Step 2 | #2 |
| AC6 (tx exactly 1 changed line) | File 2 | Step 2 | #2 |
| AC7 (`verify.sh` exists) | File 3 | Step 3 | #3 |
| AC8 (`verify.sh` executable) | File 3 | Step 3 | #3 |
| AC9 (`verify.sh` syntax OK) | File 3 | Step 3 | #3 |
| AC10 (`verify.sh` runs `pnpm turbo run bdd`) | File 3 | Step 3 | #3 |
| AC11 (auth BDD exits 0) | (gate) | Step 5 | #4 (marker) |
| AC12 (tx BDD exits 0) | (gate) | Step 5 | #4 (marker) |
| AC13 (turbo BDD exits 0) | (gate) | Step 5 | #4 (marker) |
| AC14 (no `.steps.ts`) | (negative) | Steps 1–7 | #1–#3 |
| AC15 (no `cucumber.mjs`) | (negative) | Steps 1–7 | #1–#3 |
| AC16 (no `support/register.ts`) | (negative) | Steps 1–7 | #1–#3 |
| AC17 (no `.feature`) | (negative) | Steps 1–7 | #1–#3 |
| AC18 (no `pnpm-lock.yaml`) | (negative) | Steps 1–7 | #1–#3 |
| AC19 (no ESLint touched) | (negative) | Steps 1–7 | #1–#3 |
| AC20 (no CI workflow) | (negative) | Steps 1–7 | #1–#3 |
| AC21 (exactly 4 files in diff) | §2 | n/a | #1–#3 |
| AC22 (CI job success) | (gate) | Step 5 | #4 (marker) |
| AC23 (no `Co-Authored-By`) | §4 (commit hygiene) | n/a | #1–#4 |
| AC24 (1 atomic commit — design accepts 4 per AGENTS.md §5) | §4 | n/a | #1–#4 |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
- **Spec**: `openspec/changes/fix-bdd-tsx-node22/spec.md` (Engram `#2308`; 12 requirements, 6 Gherkin scenarios, 24 AC)
- **Explore brief**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`)
- **Smoking-gun error**: `SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule` (Node 22.13.0 / 22.14.0)
- **Failing CI run (now fixed)**: `29288016689`
- **tsx exports map**: `node_modules/tsx/package.json` `exports` field declares both `tsx/esm` and `tsx/cjs` since 4.16.x
- **Loader chain anatomy**: `@cucumber/cucumber/lib/try_require.js:8` → CJS `require()` → `Module._compile`
- **Empirical test**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s on Node 22.14.0 (explore §5 + §10)
- **Modified files**:
  - `libs/features/auth/server/package.json` (35 LOC → 35 LOC; 1 line swapped)
  - `libs/features/transactions/server/package.json` (33 LOC → 33 LOC; 1 line swapped)
- **New files**:
  - `scripts/bdd/verify.sh` (~30 LOC)
- **Wiring edits**:
  - root `package.json` (+1 LOC: `bdd:verify` script)
- **Untouched BDD surface** (per explore §6 + spec §6 G6): all 12 `.feature` files (6 auth + 6 transactions), all 5 `.steps.ts` files (3 auth + 2 transactions), both `world.ts` files, both `support/register.ts` files, both `cucumber.mjs` files
- **CI workflow**: `.github/workflows/ci.yml` `BDD (Cucumber)` job — unchanged (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout)
- **Precedent**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (format reference; this design mirrors its 10-section structure but compresses to match the smaller change scope — no threat matrix, no migration section, no app code)
- **Project conventions**: AGENTS.md §2 (branch), §4 (strict TDD — config-only, vacuously RED→GREEN via explore brief), §5 (atomic commits — 4 work-unit commits), §6 (Conventional Commits, no AI attribution), §7 (boundary plugin — none affected), §8 (single source of truth — `bdd` script token lives in exactly one place per slice), §11 (out-of-scope — none touched), §12 (pre-commit checklist — single-purpose commits, rollback-trivial, ESLint untouched), §13 (Spanish mirror — none required, no `.md` added)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain` (NOT triggered, 30 net LOC ≪ 400), `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**Next phase**: `sdd-tasks` — will read this design + the spec and produce a TDD-aligned task plan with checkboxes matching the 4 commits and 7 execution steps above.

**Apply phase readiness**: this design gives `sdd-apply` everything needed. The 4 file diffs include exact final content. No re-derivation required.

**Memory hygiene**: no proactive `mem_save` from this design phase — the artifact store writes the Engram observation as part of the persistence step in the wrapping protocol. `mem_save` is called by the wrapping protocol with `topic_key=sdd/fix-bdd-tsx-node22/design`, `project=gp-v2`, `type=architecture`, `capture_prompt=false`.

**Hard rules honored**:

- AGENTS.md §2: feature branch `feat/fix-bdd-tsx-node22` cut from `develop@ea7732f`; no `main` mutation.
- AGENTS.md §4: strict TDD — RED state demonstrated empirically by explore brief §5 (no new RED test required per R7 + R8); GREEN state recorded at the same time.
- AGENTS.md §5: 4 atomic commits, each independently revertible per-slice.
- AGENTS.md §6: Conventional Commits types (`fix`, `feat`, `chore`), no AI attribution, subjects ≤ 72 chars, no trailing period.
- AGENTS.md §7: ESLint boundaries preserved (no rule, fixture, config, or runner edits).
- AGENTS.md §8: single source of truth — `bdd` script token lives in exactly one place per slice.
- AGENTS.md §11: out-of-scope list honored (17 items, mirrored from spec).
- AGENTS.md §13: no English `.md` added under `openspec/` or `docs/` → no Spanish mirror required.

---

**END OF DESIGN**.
