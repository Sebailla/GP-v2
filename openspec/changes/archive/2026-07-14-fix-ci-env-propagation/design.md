# Technical Design — `fix-ci-env-propagation`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-ci-env-propagation`
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: single PR (`auto-chain` NOT triggered — 1 file, 14 net LOC ≪ 400-line budget)
> **Strict TDD**: active (AGENTS.md §4) — config-only fix, vacuously satisfied; see §3 step 6 (the CI BDD job itself IS the regression gate)
> **Fix shape**: A — single-file `turbo.json` edit; 2 `env` arrays (7 vars × 2 tasks) + 2-line JSDoc breadcrumb; **14 net LOC**
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-14
> **Inputs read**: `proposal.md` (Engram #2343), `spec.md` (Engram #2346, 12 requirements, 6 Gherkin scenarios, 32 AC), `openspec/changes/fix-bdd-ci-zod-resolution/design.md` (format reference for hybrid config-only surgical fixes), `turbo.json` (42 LOC; `build` at lines 5–8, `bdd` at lines 25–28 — both currently without `env` / `passThroughEnv`), `.github/workflows/ci.yml` (BDD job `env:` block at lines 214–221 declares all 7 vars), `libs/core/config/env.ts:89` (eager `export const env = parseEnv(process.env)`).
> **Open questions**: none — all 5 resolved in spec §11 (Q1 no ADR, Q2 no CI lint step, Q3 yes 2-line JSDoc breadcrumb, Q4 `env` not `passThroughEnv`, Q5 no new test, Q6 no ADR, Q7 no capability file).

---

## Table of contents

1. [Goals ↔ Technical approach mapping](#1-goals--technical-approach-mapping)
2. [File-by-file diffs (1 file)](#2-file-by-file-diffs-1-file)
3. [Execution plan (8 steps, config-only)](#3-execution-plan-8-steps-config-only)
4. [Atomic commits (2)](#4-atomic-commits-2)
5. [Test execution plan](#5-test-execution-plan)
6. [Risks + mitigations (concrete)](#6-risks--mitigations-concrete)
7. [Out of scope](#7-out-of-scope)
8. [Open questions for tasks / apply phase](#8-open-questions-for-tasks--apply-phase)
9. [Validation criteria for `sdd-verify`](#9-validation-criteria-for-sdd-verify)
10. [Traceability: Spec ↔ Design](#10-traceability-spec--design)

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — BDD (Cucumber) CI job passes for the first time since PR #61 | §3 G1, R1, R2, R3, R5 | Edit `turbo.json`: add `env` array of 7 vars to the `bdd` task (lines 25–28). Turbo forwards the 7 declared vars (DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, API_URL, WEB_ORIGIN, PORT, NODE_ENV) through the task chain to `web#build`, where `@core/config`'s eager `parseEnv(process.env)` (`libs/core/config/env.ts:89`) now receives them and Zod validation passes. |
| **G2** — All 4 CI jobs green (Static, Build, Unit+integration, BDD) | §3 G2, R1, R2, R7 | Same as G1. The BDD job's only failing step was `web#build` crashing on Zod (API_URL/WEB_ORIGIN undefined). With the env propagation closed, all 4 jobs run cleanly. |
| **G3** — All 43 BDD scenarios continue to pass locally and in CI | §3 G3, R6, R8 | Implicit. The fix declares 7 vars in Turbo's task config — no `.feature`, `.steps.ts`, `world.ts`, `support/register.ts`, `cucumber.mjs`, schema, app source, step-def, or BDD harness changes. 43/43 preserved by construction. |
| **G4** — Local dev behaviour is unchanged | §3 G4, R4, R9 | The `env` field is a Turbo-specific concept. Locally the 7 vars already reach `next build` via `apps/web/.env.test`. The fix closes the gap that was already closed locally and reopened in CI. No local observable change. |
| **G5** — Cache invalidation works when env vars change | §3 G5, R3, R10 | `env` (NOT `passThroughEnv`) includes the values in the task's cache hash. Switching `API_URL=staging` → `API_URL=prod` invalidates `web#build` and `bdd` caches for affected packages — guards against stale Next.js page-data bundles that embed env-derived values. |
| **G6** — Surgical diff (only `turbo.json` touched) | §3 G6, R4, R8, R9 | The 1-file diff: 2 `env` arrays (7 vars × 2 tasks = 14 entries) + 2-line JSDoc breadcrumb above the `bdd.env` field per R3. No `.ts` / `.tsx`, no `.feature`, no `.env*`, no CI workflow, no `package.json`, no `pnpm-lock.yaml` is touched. |

---

## 2. File-by-file diffs (1 file)

> **Reading guide**: this design is the source of truth for `sdd-apply`. The apply phase MUST NOT re-derive line numbers or text. Each edit is the minimum possible.

---

### File 1 — `turbo.json` (EDIT, +16 / -0 inside 2 task blocks)

**Current state** (verified at design time via `cat turbo.json`):

```json
{
  "$schema": "https://v2-10-3.turborepo.dev/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "bdd": {
      "dependsOn": ["build"],
      "outputs": ["bdd-reports/**"]
    },
    "e2e": { "dependsOn": ["build"], "outputs": ["playwright-report/**", "test-results/**"] },
    "coverage": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "clean": { "cache": false, "outputs": [] }
  }
}
```

**Final state** (only the `build` task at lines 5–8 and the `bdd` task at lines 25–28 change):

```diff
     "build": {
       "dependsOn": ["^build"],
-      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"]
+      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"],
+      "env": [
+        "DATABASE_URL",
+        "NEXTAUTH_URL",
+        "NEXTAUTH_SECRET",
+        "API_URL",
+        "WEB_ORIGIN",
+        "PORT",
+        "NODE_ENV"
+      ]
     },
     ...
     "bdd": {
       "dependsOn": ["build"],
-      "outputs": ["bdd-reports/**"]
+      "outputs": ["bdd-reports/**"],
+      // turbo strict-mode strips undeclared env vars; declare all vars @core/config validates.
+      // must stay in sync with .github/workflows/ci.yml BDD job env block.
+      "env": [
+        "DATABASE_URL",
+        "NEXTAUTH_URL",
+        "NEXTAUTH_SECRET",
+        "API_URL",
+        "WEB_ORIGIN",
+        "PORT",
+        "NODE_ENV"
+      ]
     },
```

**Why this works** (referenced by §6 R1, R2, R4 mitigations):

- Turborepo 2.10.3 runs in default `strict` env mode. In strict mode, Turbo strips every env var not declared in a task's `env` field before launching child task processes. `env` declares values that Turbo preserves AND participates in the task's cache hash (`passThroughEnv` would preserve without hashing — R4 mitigation).
- `pnpm turbo run bdd` triggers `web#build` transitively via `bdd.dependsOn: ["build"]` (line 26). Turbo forwards declared `env` vars through the chain; undeclared tasks at any point in the chain (build OR bdd) would block propagation. Declaring `env` in **both** tasks ensures the vars survive the full chain regardless of entry point (`turbo run build` or `turbo run bdd`).
- `@core/config`'s Zod schema (`libs/core/config/env.schema.ts`) validates 5 required string fields (DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, API_URL, WEB_ORIGIN) + the `NODE_ENV` enum + the `PORT` positive integer at module load (`libs/core/config/env.ts:89`). All 7 declared vars participate in the schema contract.
- The 2-line JSDoc breadcrumb above `bdd.env` (per spec R3, resolution Q3) names the root cause ("turbo strict-mode strips undeclared env vars") and the contract source ("must stay in sync with `.github/workflows/ci.yml` BDD job env block"). The breadcrumb is intentionally placed only above the `bdd.env` field (not duplicated above `build.env`): the comment is context, not syntax, and reviewers reading the diff see it once with no need to repeat it verbatim on both tasks. The rationale applies equally to both tasks.

**Why `env` (not `passThroughEnv`)** — R3 + Q4 from spec §11:

- `env` is the **cache-correct** shape: values are included in the task's cache hash. Changing any of the 7 vars (e.g., switching `API_URL` from staging to prod) invalidates `web#build` and `bdd` caches for affected packages.
- `passThroughEnv` exposes values to child processes WITHOUT hashing them. A stale `.next/` build produced under `API_URL=staging` would be happily served for `API_URL=production` because the cache key would not detect the env change. Since `@core/config`'s validation runs at module load and the resulting validated env values (especially `API_URL` and `WEB_ORIGIN`) are embedded into Next.js page-data bundles, env changes MUST invalidate the cache. `env` is the only correct field name.
- Resolved by R3 (mandates `env`), AC5 (`has("passThroughEnv")` MUST be false), AC6 (no `"passThroughEnv"` string anywhere in `turbo.json`), AC7 (no `globalEnv` / `globalPassThroughEnv` at root).

**Why all 7 vars (not just the 2 named in the error)** — proposal §3.5:

- The CI error surfaces `API_URL` and `WEB_ORIGIN` first because `@core/config`'s Zod schema validates them eagerly at module load, and `apps/web/app/[locale]/**/page.tsx` is the first imported page during build collection. But the explore sub-agent verified empirically (Tests 4 + 5 in `explore.md` §4) that **all 5 required string fields** are stripped by Turbo: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`. `PORT` and `NODE_ENV` are simpler types but also stripped. Declaring only `API_URL` + `WEB_ORIGIN` would produce the same Zod failure on `NEXTAUTH_URL` next run. Declaring all 7 is the minimum safe set; adding future vars is straightforward append.
- The order MUST match `.github/workflows/ci.yml:214–221` per R1 + AC4 (diff readability and contract auditability). Future CI env additions get appended to BOTH `ci.yml` and `turbo.json` per the R3 breadcrumb prompt.

**Why per-task `env` (not `globalEnv` / `globalPassThroughEnv`)** — proposal §10 Q2 → spec Q2 NO:

- Global would propagate to `lint`, `test`, `typecheck`, `e2e`, `dev`, `coverage`, `clean` as well, bloating their cache hashes with env vars they don't actually consume. Per-task scopes the contract to the two gates that need it (`build` for `web#build`'s eager Zod validation; `bdd` for the transitive chain).

**No other line in this file changes.** Verification:

- AC1: `jq '.tasks.build.env' turbo.json` returns `["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "API_URL", "WEB_ORIGIN", "PORT", "NODE_ENV"]` (7 elements).
- AC2: `jq '.tasks.bdd.env' turbo.json` returns the same 7-element array as AC1.
- AC3: the 2 arrays MUST be element-wise identical.
- AC4: each array, compared position-by-position to `.github/workflows/ci.yml:214–221`, MUST match exactly.
- AC5: both new fields named `env`; `jq '.tasks.build | has("passThroughEnv")'` and `jq '.tasks.bdd | has("passThroughEnv")'` both return `false`.
- AC6: `grep -c '"passThroughEnv"' turbo.json` returns `0`.
- AC7: `jq 'has("globalEnv") or has("globalPassThroughEnv")' turbo.json` returns `false`.
- AC8: `cat turbo.json | grep -B2 '"env": \['` shows the 2-line JSDoc block (`"turbo strict-mode"` + `"must stay in sync with"`) immediately above the `bdd` task's `env` field.
- AC10: `jq . turbo.json` exits 0 (valid JSON).
- AC11: `pnpm exec turbo --root=. run --dry=json bdd` exits 0 with a valid task graph.

---

## 3. Execution plan (8 steps, config-only)

> Strict TDD discipline (AGENTS.md §4). This fix is **configuration-only**. There is no production code to test, so the RED-first step is satisfied vacuously: the explore brief (`openspec/changes/fix-ci-env-propagation/explore.md` §4, Tests 1–5) already empirically demonstrated the RED state (`pnpm turbo run bdd --force` with the CI env reproduces the 5 Zod errors during `web#build` page-data collection) AND the GREEN state (the fix was applied; the same reproducer produces 43/43 scenarios passing). No new RED test code is required.

### Step 1 — Verify local reproducer (optional sanity check)

**Action**: confirm the bug repros locally BEFORE touching any file. Mirror the explore brief's Test 4 (with CI-shaped env):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run bdd --force 2>&1 | grep -E "(ZodError|Required:)" | head -10
```

**Why optional**: the explorer's RED→GREEN is already documented (`explore.md` §4, Tests 1–5). If the contributor trusts the explorer, skip this step and go straight to Step 2.

### Step 2 — Edit File 1 (`turbo.json`)

**Action**: per §2 File 1 above, edit `turbo.json`:

1. In the `build` task (lines 5–8): append a trailing comma after the `"outputs": [...]` array (line 7) and add the 9-line `env` array (line 8+). 9-line diff inside the task block (+ comma separator on prior line + 8 array entries + closing).
2. In the `bdd` task (lines 25–28): append a trailing comma after `"outputs": ["bdd-reports/**"]` (line 27), add the 2-line JSDoc breadcrumb, then add the 9-line `env` array. 11-line diff inside the task block.
3. **No other line in the file changes.** `tasks.dev`, `tasks.lint`, `tasks.test`, `tasks.typecheck`, `tasks.e2e`, `tasks.coverage`, `tasks.clean`, and the root-level `$schema` + `ui` + `tasks` keys remain byte-identical.

**Verify**: `cat turbo.json` shows the env arrays in both task blocks; `grep -c '"passThroughEnv"' turbo.json` returns `0`; the JSDoc breadcrumb sits immediately above the `bdd` task's `env` field.

### Step 3 — Verify JSON + Turbo schema validity

**Action**: confirm the JSON is structurally valid and Turbo parses the new schema:

```bash
# JSON validity
node -e "JSON.parse(require('fs').readFileSync('turbo.json', 'utf-8'))"
echo "exit=$?"    # Expected: exit=0

# Turbo dry-run (parses the schema, doesn't execute)
pnpm turbo run bdd --dry=json 2>&1 | head -30
# Expected: valid task graph; no schema validation error
```

**Verify**: both exit 0; no schema validation warnings.

### Step 4 — Local BDD verify (TDD GREEN check)

**Action**: rerun the reproducer from Step 1 to confirm the fix works:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run bdd --force
```

**Verify**: command exits 0; log shows `web:build SUCCESS` + `api:build SUCCESS`; auth 18/18 + transactions 25/25 = 43/43 scenarios; 0 skipped/pending/todo.

### Step 5 — Local build-only verify (no Turbo, direct `next build` sanity)

**Action**: confirm `pnpm turbo run build` exits 0 (the turbo-wrapped build path used for the Build CI job):

```bash
pnpm turbo run build
echo "exit=$?"    # Expected: exit=0
```

**Verify**: command exits 0; both `apps/web/.next/` and `apps/api/dist/` populated; no Zod errors (R5 regression gate).

### Step 6 — Cache invalidation check (R10 / G5)

**Action**: verify the cache invalidates when any of the 7 declared env vars changes:

```bash
# Populate cache under DATABASE_URL=<A>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test_a \
NEXTAUTH_SECRET=test-secret \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run build --force 2>&1 | grep -E "(web|api).*SUCCESS"

# Switch DATABASE_URL to <B> (no --force) — expect cache miss
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test_b \
NEXTAUTH_SECRET=test-secret \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run build 2>&1 | grep -E "(web|api).*(CACHE HIT|cache hit|CACHED)"
# Expected: empty (cache miss for both web#build and api#build)
```

**Verify**: second run is a cache MISS for `web#build` (because `DATABASE_URL` participates in the cache hash via the new `env` array). If the second run is a `CACHE HIT`, the fix is incomplete — re-verify Step 2 (the `env` array text + order).

### Step 7 — Quality gates from AGENTS.md §3

**Action**: run the full quality-gate suite to confirm no regression:

```bash
pnpm install --frozen-lockfile   # exits 0 — no lockfile drift (R9 + AC32)
pnpm turbo run build lint typecheck test   # exits 0 across all workspaces
pnpm lint:fixtures               # exits 0 — no new boundary violations
```

**Verify**: every command exits 0. If any fails, the fix is incomplete — inspect the diff and re-verify Step 2 + Step 3.

### Step 8 — Commit

**Action**: commit per §4 (2 atomic commits). The branch `feat/fix-ci-env-propagation` should already be cut from `develop` (AGENTS.md §2).

Include in commit #1 body the rationale:

> Config-only fix. The RED state is empirically demonstrated by `pnpm turbo run bdd --force` with the BDD job env vars: `web#build` fails on `ZodError: Required: API_URL, WEB_ORIGIN` at `libs/core/config/env.ts:89` during Next.js page-data collection. The GREEN state is empirically demonstrated by the same command after applying the R1 + R2 env arrays: 0 Zod errors; 43/43 scenarios pass. No new test code is added — AGENTS.md §4 strict TDD is satisfied vacuously because no production code is touched (R5 + R8 forbid source edits). The CI BDD job itself is the regression gate: the post-merge run MUST report `success` for the first time since PR #61.

---

## 4. Atomic commits (2)

> Work-unit aligned (AGENTS.md §5). Every commit is independently revertible. No `Co-Authored-By` (AGENTS.md §6 + persona hard rule). Subjects ≤ 72 chars, imperative, no trailing period. Types: `fix`, `chore` only.

| # | Type | Subject | Files | TDD phase | Spec req |
|---|------|---------|-------|-----------|----------|
| 1 | `fix` | `fix(ci): turbo.json — declare env for build + bdd tasks (R1, R2, R3)` | `turbo.json` (EDIT, +16 lines inside 2 task blocks: 9 lines `build.env` + 9 lines `bdd.env` + 2-line JSDoc breadcrumb; trailing commas on prior `outputs` lines) | n/a (config) | R1, R2, R3 |
| 2 | `chore` | `chore(ci): verify pnpm turbo run bdd exits 0 locally (R5 marker)` | (verification marker — no file edits; commit body documents the local `pnpm turbo run bdd` exit-0 proof + the cache-invalidation verification per R10 + G5) | n/a (verification) | R5, R10 |

**Totals**: 2 commits, +16 net LOC source (14 var declarations + 2 JSDoc lines), 1 file. Well under the 400-line review budget; `auto-chain` is NOT triggered, per spec §1 Delivery.

**Why split #1 and #2 instead of one combined `fix`** — proposal §4 hint:

- #1 is the actual fix (the source edit). #2 is the verification marker (proof that the fix works locally with the BDD-env recipe; commits preserve this proof in the git log for posterity).
- `git revert <sha>` of #1 alone cleanly reverts the fix; #2's message remains in the log as evidence of the pre-revert GREEN state.
- Reviewer focus: #1 is the "structural fix to review"; #2 is the "local proof it's correct".

**Why no `chore` for the lockfile** (contrast with `fix-bdd-ci-zod-resolution`): that predecessor had to regen the lockfile because it moved a dep's declaration slot. THIS fix adds no `env` field's worth of lockfile churn — Turbo config is not in the lockfile. `pnpm install --frozen-lockfile` exits 0 unchanged, so no lockfile commit is needed (R9 + AC14).

**Single-PR**: 14 net LOC ≪ 400-line budget → `auto-chain` NOT triggered. Spec §1 Delivery field confirmed.

---

## 5. Test execution plan

> Mapped to spec G1–G6 + their Gherkin scenarios. Each gate maps to a concrete executable command.

| Spec goal | Test command | Expected outcome |
|-----------|--------------|------------------|
| **G1.1** (BDD CI passes) | GitHub Actions `BDD (Cucumber)` job on the new PR | job reports `success`; 43/43 scenarios (18 auth + 25 transactions); first time green since PR #61 |
| **G2.1** (4 jobs green) | GitHub Actions CI on the new PR | Static analysis, Build, Unit + integration, BDD all report `success` |
| **G3.1** (43 scenarios preserved) | `pnpm turbo run bdd` on Node 22.13.0 with `apps/web/.env.test` | exit 0; 18 auth + 25 transactions = 43; 0 skipped/pending/todo |
| **G4.1** (local unchanged) | `pnpm turbo run build` on developer machine + direct `next build` for sanity | exit 0; output paths unchanged from pre-fix |
| **G5.1** (cache invalidation) | `pnpm turbo run build` with `DATABASE_URL=<A>` → swap to `DATABASE_URL=<B>` → `pnpm turbo run build` (no `--force`) | second run is cache MISS for `web#build` and `api#build` (env vars participate in cache hash) |
| **G6.1** (surgical diff) | `git diff develop...feat/fix-ci-env-propagation --name-only` | exactly 1 file: `turbo.json` |

### Local non-CI verification (run on `feat/fix-ci-env-propagation` before pushing)

```bash
# Confirm env arrays exist in both tasks (AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8)
jq '.tasks.build.env' turbo.json     # 7-element array, names match AC1
jq '.tasks.bdd.env' turbo.json       # 7-element array, identical to AC1
grep -c '"passThroughEnv"' turbo.json   # 0
jq 'has("globalEnv") or has("globalPassThroughEnv")' turbo.json   # false
grep -B2 '"env": \[' turbo.json | head -6  # 2-line JSDoc above bdd.env

# Confirm only turbo.json was modified (G6.1, AC9, AC12–AC17)
git diff develop --name-only
# Expected: turbo.json

git diff develop --stat -- pnpm-lock.yaml
# Expected: no changes (AC14)

git diff develop --name-only -- '*.ts' '*.tsx' 'package.json' '.github/workflows/**' '*.env*'
# Expected: empty

# Run the BDD suite locally (mirrors the CI command — G1.1, G3.1, R5)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run bdd --force
# Expected: exit 0; auth 18/18 + transactions 25/25 = 43/43; web#build + api#build > SUCCESS

# Cache invalidation check (G5.1, R10, AC23)
# (See Step 6 above for the 2-iteration recipe.)

# Quality gates from AGENTS.md §3 (R9, AC24, AC32)
pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test && pnpm lint:fixtures
# Expected: all exit 0
```

### Manual inspection (read-the-diff)

- Inspect `turbo.json` lines 5–13 (`build` task with `env` array added) and lines 25–37 (`bdd` task with JSDoc breadcrumb + `env` array) to confirm:
  - Both `env` arrays contain exactly 7 entries in the correct order (matching `ci.yml:214–221` per AC4).
  - The 2-line JSDoc breadcrumb sits immediately above the `bdd` task's `"env"` key per R3 + AC8.
  - No other key, value, ordering, or whitespace in `turbo.json` changes (R4 → AC9).
- Inspect the PR body for the R11 history paragraph (4-PR bypass lineage + root cause) and the R12 `env`-vs-`passThroughEnv` paragraph (cache-correctness distinction).

---

## 6. Risks + mitigations (concrete)

> Mirrors proposal §7 R1–R7 + spec §12 risk mapping with the concrete mitigation this design adopts. No risk-table inflation.

| ID | Risk | Likelihood | Concrete mitigation in this design |
|----|------|------------|------------------------------------|
| **R1** | Declaring all 7 env vars in `turbo.json` inflates the cache-key space and may invalidate caches more often than desired across matrix envs. | Low | (a) This is the **intended behaviour**: env vars that flow through eager module-load validation SHOULD invalidate the cache. (b) Other env vars (`TURBO_TOKEN`, `PATH`, etc.) are hashed separately by Turbo's own internal mechanism and are NOT affected by the `env` array. (c) R3 + R10 + AC23 enforce cache correctness with explicit verification recipes in §5. |
| **R2** | Missing a required env var in the `env` array would surface as a different Zod failure mode than the original bug (rotating Zod errors). | Low | (a) The explore sub-agent enumerated all 5 required string fields + the 2 simpler types empirically (`explore.md` §4, Tests 4 + 5). (b) The fix declares all 7 — the minimum complete contract. (c) Adding `STRIPE_*` or other future vars is a straightforward append to both `build.env` and `bdd.env`. (d) AC1 + AC2 (jq assertions on both arrays) verify the count; AC4 verifies the contract alignment with `ci.yml:214–221`. |
| **R3** | Future env var additions require updating `turbo.json` (no automatic detection). | Low | (a) The R3 JSDoc breadcrumb explicitly names the contract: *"must stay in sync with .github/workflows/ci.yml BDD job env block"*. (b) PR description documents the contract. (c) Adding a CI lint check (`scripts/check-turbo-env.ts`) is out of scope per spec §11 Q2; defer to a follow-up slice if the pattern recurs. |
| **R4** | A future contributor might pick `passThroughEnv` instead of `env` and silently break cache correctness. | Low | (a) The §2 explanation documents the distinction explicitly (proposal §3.3 + spec R3). (b) The PR description (R12 paragraph) includes the same contrast: `env` participates in cache hash; `passThroughEnv` does not. (c) The R3 JSDoc breadcrumb above `bdd.env` names "turbo strict-mode strips undeclared env vars" so the next contributor reading the file understands the discipline. (d) AC5/AC6/AC7 verify the field name is `env` (not `passThroughEnv`, not `globalEnv`) at verify time. |
| **R5** | Remote cache entries created before this fix (with `--force` runs) may have hidden environment assumptions that don't match this fix's contract. | Low | (a) The next CI run after merge effectively repopulates the remote cache under the new contract. (b) No green remote cache for `web#build` exists in the slice-7/8 lineage (all predecessor green-CIs came from the bypassed gate path or were failures). (c) `--force` is NOT required on first CI run. (d) Cache invalidation works correctly going forward per G5 + AC23. |
| **R6** | Build job's `continue-on-error: true` (`.github/workflows/ci.yml:175–177`) means "Build job green" doesn't prove the build actually runs. | Med (pre-existing) | (a) Out of scope per spec §4 non-goal #15 + §11 Q6: predecessor proposal `fix-bdd-ci-zod-resolution` §10 Q5 already deferred this. (b) The BDD gate (G1) is the authoritative signal — `pnpm turbo run bdd` transitively triggers `web#build`, and the post-fix GREEN proves the underlying fix works end-to-end. (c) A future slice can revisit the Build job's `continue-on-error` flag. |
| **R7** | Turbo 2.x's `env` semantics changed across minors (e.g., 2.10 vs 2.11 might process `env` differently). | Very low | (a) Turbo's `env` field has been stable since 2.0; `^2.10.3` (root `package.json`) pins to the same minor. (b) This is the standard contract for any Turbo config. (c) A future Turbo major bump would require re-verification of R1 + R2 + R3, but that's the same maintenance burden as any other Turbo config consumer. |

### Per-file rollback analysis (matches proposal §8)

- **Revert `build.env` only**: `web#build` fails on the same 5 Zod errors; BDD gate fails. The `bdd.env` array alone is insufficient because `web#build` runs at the `build` layer (transitive via `bdd.dependsOn: ["build"]`). **NOT acceptable as a half-fix.**
- **Revert `bdd.env` only**: `web#build` passes (its own `env` is declared); `pnpm turbo run bdd` propagates the vars via the chain and the BDD steps run. **Acceptable as a half-fix**; the Build job continues to validate `web#build` standalone.
- **Revert both env arrays + the JSDoc breadcrumb** (the whole PR): `turbo.json` returns to its pre-fix state; the BDD gate returns to the same Zod failure it shows today. `git revert <merge-sha>` reverses the PR cleanly.

---

## 7. Out of scope

> Restated from spec §4 + proposal §2.2 (mirrors AGENTS.md §11). The orchestrator MUST NOT add items here without a new SDD change.

1. Lazy-validating `@core/config` so that missing required fields don't throw at module load (proposal Shape B; explore brief Shape A; ~30–50 LOC + tests; changes fail-fast semantics; deferred to a separate architectural change).
2. Adding `passThroughEnv` instead of `env` (proposal Shape D; rejected — cache-incorrect; build outputs embed env-derived values and cache hashes must include them).
3. Declaring `globalEnv` or `globalPassThroughEnv` at the top level of `turbo.json` (rejected per proposal §10 Q2 → spec Q2 — bloats `lint` / `test` / `typecheck` / `e2e` / `dev` cache hashes with vars they don't consume).
4. Editing `.github/workflows/ci.yml` (the BDD job's env block at lines 214–221 is correct as authored; the contract violation is in the Turbo task definition).
5. Editing `libs/core/config/env.ts`, `env.schema.ts`, or `index.ts` (eager validation stays as-is; it exposed a real task-contract bug and should stay eager).
6. Editing `apps/web/.env.test`, `apps/web/.env.example`, or any `.env*` file (env vars come from the BDD job's CI env block; locally `apps/web/.env.test` already provides them).
7. Adding a `package.json` to `libs/features/{auth,transactions}/shared/` (the orphan-directory architectural fix; deferred to a separate `fix-orphan-shared-directories` change).
8. Setting `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (Shape B from `fix-bdd-ci-zod-resolution` §3.5; rejected — workspace-wide blast radius).
9. Editing `apps/web/auth.ts` or any `apps/web/app/[locale]/**/*.tsx` RSC page.
10. Editing `apps/api/**` (controllers, services, Prisma schema, `nest-cli.json`).
11. Adding a new ESLint rule, editing `tools/eslint-plugin-boundary/**`, or adding/modifying a fixture under `__fixtures__/`.
12. Adding a new dev dependency, runtime dependency, version bump, or `pnpm install` of any kind. The lockfile MUST stay byte-identical (R9 + AC32).
13. Adding a new BDD scenario, unit test, integration test, or e2e test. The CI BDD job itself IS the regression gate.
14. Adding a CI smoke test that strips HOME pollution (`HOME=$(mktemp -d)`) or any other new CI step.
15. Adding `continue-on-error: false` to the Build job's `web#build` step (pre-existing governance issue from `fix-bdd-ci-zod-resolution` §10 R6; deferred).
16. Removing the `bdd_tsx_node22` workaround tokens or any preceding `fix-bdd-*` change's residue (those are closed and unrelated).
17. Migrating `gastos-personales/` to the vertical-slicing model.
18. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
19. Creating `openspec/specs/<capability>/spec.md` (proposal §4.2 — no capability-level contract change; per spec Q7 resolution).
20. Writing an ADR (`docs/architecture/decisions/00XX-turbo-env-vs-passthrough.md`); the 2-line JSDoc-style breadcrumb in `turbo.json` (R3) plus the PR body (R11 + R12) carries the same context for less ceremony.
21. Adding a CI lint step that diffs `turbo.json#bdd.env` against `ci.yml#bdd.env` to assert completeness (per spec Q2 resolution — scope creep).

---

## 8. Open questions for tasks / apply phase

> **None.** All 5 open questions from proposal §10 + spec §11 are RESOLVED in spec.md (Q1 no ADR, Q2 no CI lint step, Q3 yes JSDoc breadcrumb, Q4 `env` not `passThroughEnv`, Q5 no new test, Q6 no ADR restated, Q7 no capability file).

### Design↔spec reconciliation note

The spec R3 mandates exactly **2 lines** of JSDoc-style breadcrumb; this design preserves that count verbatim (2 lines above `bdd.env`). No drift.

The spec R1 mandates the var order matching `ci.yml:214–221`. This design preserves that order verbatim in both `build.env` and `bdd.env`. No drift.

The spec R4 mandates that no other key/value/ordering/whitespace in `turbo.json` changes. This design's §2 File 1 diff targets ONLY the `build` task (lines 5–8) + the `bdd` task (lines 25–28); the root `$schema` + `ui` + `tasks.{dev,lint,test,typecheck,e2e,coverage,clean}` blocks stay byte-identical. No drift.

No design↔spec reconciliation required at apply time — unlike `fix-bdd-ci-zod-resolution` §8 Q1 (which had a `../../`-path-prefix bug), this design lands cleanly with no spec amendments needed.

---

## 9. Validation criteria for `sdd-verify`

` sdd-verify` will check the following, ALL of which this design enables to PASS deterministically:

### Functional gates

1. **`pnpm turbo run bdd` exits 0 in CI on the new PR**: run the reproducer with the BDD job env vars per step 4 of §3 — exit 0; auth 18/18 + transactions 25/25 = 43/43 scenarios; 0 skipped/pending/todo. (Spec G1.1, AC18–AC22, AC25.)
2. **All 4 CI jobs green**: GitHub Actions UI shows Static analysis, Build, Unit + integration, BDD (Cucumber) all `success`. (Spec G2.1, AC26.)
3. **Cache invalidation works on env change**: per step 6 of §3 — `pnpm turbo run build` with `DATABASE_URL=<A>` → swap to `DATABASE_URL=<B>` (no `--force`) → cache MISS for `web#build` + `api#build`. (Spec G5.1, AC23.)
4. **Local dev unchanged**: `pnpm turbo run build` on developer machine exits 0; same output paths as pre-fix. (Spec G4.1, AC18.)

### Hygiene gates (per AGENTS.md §12 + spec AC1–AC32)

5. **Diff is exactly 1 file**: `git diff develop...feat/fix-ci-env-propagation --name-only` lists exactly `turbo.json` (AC9). No `.ts`, no `.tsx`, no `.feature`, no `.steps.ts`, no `cucumber.mjs`, no `.env*`, no `.github/workflows/ci.yml`, no `package.json`, no `pnpm-lock.yaml` (AC9, AC12–AC17).
6. **`turbo.json` env fields are structurally correct**: AC1 (7 vars in `build.env`), AC2 (7 vars in `bdd.env`), AC3 (arrays identical), AC4 (order matches `ci.yml:214–221`), AC5 (field name is `env`, not `passThroughEnv`), AC6 (no `passThroughEnv` string anywhere), AC7 (no `globalEnv` / `globalPassThroughEnv` at root), AC8 (2-line JSDoc breadcrumb above `bdd.env`).
7. **`turbo.json` post-fix is structurally valid JSON + parses in Turbo schema**: AC10 (`jq . turbo.json` exits 0), AC11 (`pnpm exec turbo run --dry=json bdd` exits 0 with valid task graph).
8. **Lockfile byte-identical**: AC14 (`git diff develop --stat -- pnpm-lock.yaml` shows no changes); AC32 (`pnpm install --frozen-lockfile` exits 0 in CI).
9. **No ESLint / boundary-plugin files touched**: AC17 (`git diff develop --name-only -- 'tools/eslint-plugin-boundary/**' 'eslint.config.*'` empty).
10. **All quality gates from AGENTS.md §3 pass**: AC24 (`pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test && pnpm lint:fixtures` exits 0).

### Atomic-commit + Conventional-Commit gates (per AGENTS.md §5, §6)

11. **2 atomic commits** (per §4 of this design): `git log --oneline develop..feat/fix-ci-env-propagation` shows exactly 2 commits.
12. **No `Co-Authored-By`** in any commit (AC29): `git log feat/fix-ci-env-propagation --pretty=format:"%B" | grep -i "co-authored-by"` returns empty.
13. **Conventional Commit subject format**: both subjects match `^fix\(ci\): .+` or `^chore\(ci\): .+`, ≤ 72 chars, no trailing period (AC28).
14. **PR description includes R11 history paragraph**: AC30 (mentions 3+ of the 4 predecessor-PR names OR the count "4 consecutive PRs").
15. **PR description includes R12 `env` vs `passThroughEnv` paragraph**: AC31 (contrasts `env` (cache-hashed) with `passThroughEnv` (not cache-hashed) in at least one sentence).

---

## 10. Traceability: Spec ↔ Design

> Cross-walk of every spec requirement to the design section that delivers it, plus the file(s) and commit(s) that produce it.

| Spec req | Spec scenarios | Design section | File(s) | Commit(s) |
|----------|---------------|----------------|---------|-----------|
| **R1** — `turbo.json` `bdd` task declares an `env` array of 7 vars | G1.1, G3.1, G5.1, G6.1 | §2 File 1 (`bdd.env`) | `turbo.json` (lines 25–37 area) | #1 |
| **R2** — `turbo.json` `build` task declares the same `env` array | G1.1, G3.1, G4.1, G5.1, G6.1 | §2 File 1 (`build.env`) | `turbo.json` (lines 5–13 area) | #1 |
| **R3** — The `env` field is `env`, not `passThroughEnv`; JSDoc-style breadcrumb above `bdd.env` | (R1 + R2 sub-clause) | §2 File 1 (2-line JSDoc + AC5/AC6/AC7 enforcement) | `turbo.json` (line 29 area, JSDoc above `bdd.env`) | #1 |
| **R4** — Minimum diff: no other lines in `turbo.json` are touched | G4.1, G6.1 | §2 File 1 (negative: only lines 5–8 + 25–28 change) | (negative) | #1 |
| **R5** — `pnpm turbo run bdd` exits 0 in CI with the BDD job reporting `success` | G1.1, G2.1 | §3 step 4 (local) + §5 G1.1 + §9 #1 (CI gate) | (verification gate) | #2 (local proof) |
| **R6** — All 43 BDD scenarios continue to pass locally AND in CI | G3.1, G4.1 | §1 G3 (implicit preservation) + §5 G3.1 | (negative — by construction) | n/a (CI gate) |
| **R7** — All 4 CI jobs report `success` | G2.1 | §1 G2 + §9 #2 | (CI gate) | n/a (CI gate) |
| **R8** — No `.ts` source file is modified | G3.1, G4.1, G6.1 | §3 (no `.ts` touched) + §6 R1, R2 mitigations | (negative) | #1, #2 |
| **R9** — No new dependency is added | G4.1, G6.1 | §4 (no lockfile churn; `pnpm install --frozen-lockfile` exits 0) | (negative) | #1, #2 |
| **R10** — Cache invalidation works when env vars change | G5.1 | §3 step 6 + §5 G5.1 + §9 #3 | (verification gate) | #2 (verification marker) |
| **R11** — PR description calls out the 4-PR BDD bypass history | (PR template) | §5 manual inspection + §9 #14 (AC30) | (PR description; visible at review) | n/a (PR body) |
| **R12** — PR description contrasts `env` vs `passThroughEnv` | (PR template) | §5 manual inspection + §9 #15 (AC31) | (PR description; visible at review) | n/a (PR body) |

### Goal ↔ Design cross-walk

| Goal | Design sections delivering it |
|------|-------------------------------|
| **G1** (BDD CI passes) | §2 File 1 (`build.env` + `bdd.env`); §3 step 4 (local GREEN check); §5 G1.1 (CI gate) |
| **G2** (4 jobs green) | §2 File 1 (`build.env` + `bdd.env`); §3 step 4; §9 #2 (CI gate) |
| **G3** (43 scenarios preserved) | §1 G3 (implicit by construction); §3 (no `.ts` touched); §5 G3.1 |
| **G4** (local unchanged) | §2 File 1 (`env` field is Turbo-specific; no local behaviour change); §3 step 5; §9 #4 |
| **G5** (cache invalidation) | §2 File 1 (`env` not `passThroughEnv`); §3 step 6; §5 G5.1; §9 #3 |
| **G6** (surgical diff) | §2 File 1 (only `turbo.json`); §6 R2, R4 mitigations; §9 #5 |

### Requirement ↔ Acceptance-criterion matrix (additions vs. spec §12)

| Spec req | ACs from spec | §2 file | §3 step | §4 commit |
|----------|--------------|---------|---------|-----------|
| R1 | AC1, AC3, AC4, AC25 | File 1 (`bdd.env`) | Step 2 | #1 |
| R2 | AC2, AC3, AC4, AC25 | File 1 (`build.env`) | Step 2 | #1 |
| R3 | AC5, AC6, AC7, AC8 | File 1 (JSDoc + field naming) | Step 2 | #1 |
| R4 | AC9, AC10, AC11 | (negative: only 2 task blocks touched) | Step 2 + Step 3 | #1 |
| R5 | AC18, AC19, AC20, AC21, AC22, AC25 | (gate) | Step 4 | #2 (local proof) + CI |
| R6 | AC18, AC19, AC20, AC21 | (implicit) | Step 4 | n/a (CI gate) |
| R7 | AC26 | (gate) | n/a | n/a (CI gate) |
| R8 | AC12 | (negative) | Step 7 | #1, #2 |
| R9 | AC13, AC14, AC15, AC32 | (negative; lockfile byte-identical) | Step 7 | #1, #2 |
| R10 | AC23 | (gate) | Step 6 | #2 (verification marker) |
| R11 | AC30 (PR description convention) | §5 manual inspection | n/a | n/a (PR body) |
| R12 | AC31 (PR description convention) | §5 manual inspection | n/a | n/a (PR body) |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
- **Spec**: `openspec/changes/fix-ci-env-propagation/spec.md` (Engram `#2346`; 12 requirements, 6 Gherkin scenarios, 32 AC)
- **Explore brief**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`) — empirical reproducer recipe (Tests 1–5) + the verified root cause (Turbo strict-mode strips undeclared env vars) + the 4 fix-shape candidates (A/B/C/D)
- **Smoking-gun error**: `ZodError: Required: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, API_URL, WEB_ORIGIN at libs/core/config/env.ts:89` (eager module-load validation), surfaced during Next.js page-data collection at `web#build`
- **Loading-config references** (verified at design time):
  - `turbo.json:5–8` — current `build` task (no `env` / `passThroughEnv`); the 7-line gap the fix closes
  - `turbo.json:25–28` — current `bdd` task (no `env` / `passThroughEnv`); same gap
  - `.github/workflows/ci.yml:214–221` — BDD job-level `env:` block with all 7 vars; the contract `turbo.json` must propagate
  - `.github/workflows/ci.yml:175–177` — Build job's `web#build` step has `continue-on-error: true` (pre-existing; out of scope per R6 mitigation)
  - `libs/core/config/env.ts:89` — `export const env = parseEnv(process.env)` (eager module-load validation that surfaces the bug)
  - `libs/core/config/env.schema.ts` — Zod schema with the 5 required string fields (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`) + `NODE_ENV` enum + `PORT` positive integer
- **Empirical reproducer (from `explore.md` §4, Tests 1–5)**:

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
  # Expected on develop (RED): web#build fails on 5 Zod errors during page-data collection;
  # auth 18/18 + transactions 25/25 do NOT run because bdd.dependsOn: ["build"] blocks.

  # GREEN — post-fix (R1 + R2 + R3 applied):
  # Same command; expected: exit 0; web#build green; auth 18/18 + transactions 25/25 = 43/43.

  # Loose-mode control (proves the boundary is Turbo, not Next):
  pnpm turbo run build --filter=web --force --env-mode=loose
  # Pre-fix GREEN with the CI env — confirms Next.js is downstream of the loss, not its source.
  ```

- **BDD gate history** (per proposal §1 + §11): PR #61 merged the env-rich BDD job config; 4 subsequent PRs (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) were admin-merged with the BDD gate bypassed because of this latent bug. Fixing this proposal closes the underlying gate permanently.
- **Predecessor proposal 1**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/design.md` — format reference for surgical 4-file config fixes (mirrored the 10-section structure)
- **Predecessor proposal 2**: `openspec/changes/fix-bdd-ci-zod-resolution/design.md` — format reference for hybrid config-only surgical fixes; compressed from that predecessor's 4-file diff down to 1 file for this fix's simpler shape (no source edit, no lockfile regen, no schema work)
- **Project conventions**: AGENTS.md §2 (branch — develop → `feat/fix-ci-env-propagation`, no `main` mutation), §3 (quality gates — `pnpm install` exits 0, Postgres healthy, `turbo build lint typecheck test` exits 0, `lint:fixtures` exits 0, `turbo bdd e2e` exits 0 — all 6 must pass), §4 (strict TDD — config-only fix, vacuously RED→GREEN via `explore.md` §4 Tests 1–5), §5 (atomic commits — 2 work-unit commits), §6 (Conventional Commits — `fix(ci):` + `chore(ci):`, no AI attribution), §7 (boundary plugin — no rule, fixture, config, or runner edits), §8 (single source of truth — env contract declared in exactly one place per gate: `turbo.json` `tasks.{build,bdd}.env`; `ci.yml:214–221` authors the values), §11 (out-of-scope list — none of its items touched), §12 (pre-commit checklist — single-purpose commits, rollback-trivial, ESLint untouched), §13 (Spanish mirror — no English `.md` added under `openspec/` or `docs/` beyond the proposal + spec + design, mirroring `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` precedents)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain` (NOT triggered; 14 net LOC ≪ 400), `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**Next phase**: `sdd-tasks` — will read this design + the spec (no design↔spec reconciliation needed per §8) and produce a TDD-aligned task plan with checkboxes matching the 2 commits and 8 execution steps above.

**Apply phase readiness**: this design gives `sdd-apply` everything needed for the actual file edits. The 1 source diff includes exact final content (`turbo.json` `build.env` and `bdd.env` blocks + 2-line JSDoc breadcrumb). No re-derivation required.

**Memory hygiene**: the design phase calls `mem_save` once with `topic_key=sdd/fix-ci-env-propagation/design`, `project=gp-v2`, `type=architecture`, `scope=project`, `capture_prompt=false`.

**Hard rules honored**:

- AGENTS.md §2: feature branch `feat/fix-ci-env-propagation` cut from `develop`; no `main` mutation.
- AGENTS.md §4: strict TDD — RED state demonstrated empirically by `explore.md` §4 Tests 1–5 (no new RED test required per R5 + R8); GREEN state recorded by the same reproducer after R1+R2+R3.
- AGENTS.md §5: 2 atomic commits, each independently revertible per-file.
- AGENTS.md §6: Conventional Commits types (`fix`, `chore`), no AI attribution, subjects ≤ 72 chars, no trailing period.
- AGENTS.md §7: ESLint boundaries preserved (no rule, fixture, config, or runner edits).
- AGENTS.md §8: single source of truth — env contract declared in exactly one place per gate (`turbo.json` `tasks.{build,bdd}.env`); CI workflow (`ci.yml:214–221`) authors the values; `turbo.json` mirrors the keys.
- AGENTS.md §11: out-of-scope list honored (21 items, mirrored from spec).
- AGENTS.md §13: no English `.md` added under `openspec/` or `docs/` beyond the proposal + spec + design → no Spanish mirror required (mirrors `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` precedents).

---

**END OF DESIGN**.
