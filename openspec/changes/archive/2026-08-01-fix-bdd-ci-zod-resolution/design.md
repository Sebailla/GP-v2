# Technical Design — `fix-bdd-ci-zod-resolution`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-bdd-ci-zod-resolution`
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: single PR (`auto-chain` NOT triggered — 3 files, 5 net LOC ≪ 400-line budget)
> **Strict TDD**: active (AGENTS.md §4) — config-only fix, vacuously satisfied; see §3 step 6
> **Fix shape**: A' — `apps/api/package.json` (move `zod` devDep → dep) + `apps/api/tsconfig.json` (add `paths` mapping for `zod` + 3-line JSDoc comment) + `pnpm-lock.yaml` (auto-regen)
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-13
> **Inputs read**: `proposal.md` (Engram #2329), `spec.md` (Engram #2331, 13 requirements, 6 Gherkin scenarios, 30 AC), `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/design.md` (format reference), `apps/api/package.json` (50 LOC, zod devDep at line 48), `apps/api/tsconfig.json` (42 LOC, baseUrl `"../.."` at line 10, paths block lines 19–33), one schema file (`login.ts:1` confirming `import { z } from "zod";`), `node_modules/.pnpm/zod@4.4.3/node_modules/zod/package.json` (confirms on-disk pnpm-canonical path with `"main": "./index.cjs"`, `"types": "./index.d.cts"`).
> **Open questions**: see §8 — one design↔spec discrepancy that apply phase MUST reconcile.

---

## Table of contents

1. [Goals ↔ Technical approach mapping](#1-goals--technical-approach-mapping)
2. [File-by-file diffs (3 files)](#2-file-by-file-diffs-3-files)
3. [Execution plan (7 steps, config-only)](#3-execution-plan-7-steps-config-only)
4. [Atomic commits (3)](#4-atomic-commits-3)
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
| **G1** — `apps/api#build` exits 0 in clean CI | §3 G1, R1, R2, R3, R8 | Edit `apps/api/package.json` line 48: delete `"zod": "^4.4.3"` from `devDependencies`, insert it as last entry of `dependencies` (after line 31 `"rxjs": "7.8.1"`). Edit `apps/api/tsconfig.json` `compilerOptions.paths`: add `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` (with 3-line JSDoc comment) as last entry inside the `paths` block (after line 32). Then `pnpm install` to regen lockfile; `pnpm --filter api build` to verify. |
| **G2** — All 15 TS2307 errors closed | §3 G2, R1, R2, R11 | Same as G1. The 5 errors in `apps/api/src/` are closed by R1 (devDep → dep makes `apps/api/node_modules/zod` a real symlink, so Node10 ancestor walk from `apps/api/src/` succeeds). The 10 errors in `libs/features/*/shared/schemas/` are closed by R2 (the `paths` mapping intercepts the bare `zod` specifier BEFORE the ancestor walk, mapping it to the pnpm content-addressed store entry at the workspace root). |
| **G3** — BDD CI gate flips FAIL → PASS | §3 G3, R1, R2, R9 | The `BDD (Cucumber)` CI job runs `pnpm turbo run bdd`, which triggers `api#build` via `turbo.json bdd.dependsOn`. R1+R2 unblock `api#build`, so the entire pipeline goes GREEN end-to-end. No CI workflow edit. |
| **G4** — Zero BDD scenario regression (43/43) | §3 G4, R5, R10 | Implicit. The 5-LOC change does not alter any `.feature`, `.steps.ts`, `world.ts`, `support/register.ts`, `cucumber.mjs`, schema content, app source, step-def, or BDD harness — all preserved byte-for-byte. 43/43 preserved by construction. |
| **G5** — `apps/web` zod 3.x unaffected | §3 G5, R6 | The dep move is in `apps/api/package.json` ONLY. `apps/web/package.json`'s `"zod": "3.24.1"` pin stays byte-identical. The R2 `paths` mapping is TypeScript-only (`apps/api/tsconfig.json`) — does not touch `apps/web`'s resolution. pnpm's existing dual-version contract (zod 3 for web, zod 4 for api) stays intact. |
| **G6** — Surgical config-only diff | §3 G6, R4, R5, R6, R7 | The 2 source edits + 1 auto-regenerated lockfile. Total 3 files. No `.ts` source touched, no schema files touched, no ESLint/boundary/CI/workflow edits. |

---

## 2. File-by-file diffs (3 files)

> **Reading guide**: this design is the source of truth for `sdd-apply`. The apply phase MUST NOT re-derive line numbers, paths, or text. Each edit is the minimum possible.

---

### File 1 — `apps/api/package.json` (EDIT, +1 / -1, single line moved)

**Current state** (lines 16–49, broken: zod is a `devDependency`, so `apps/api/node_modules/zod` is NOT a symlink, so Node10 ancestor walk from `apps/api/src/` fails):

```json
  "dependencies": {
    "@auth/prisma-adapter": "2.7.4",
    "@core/config": "workspace:*",
    "@core/database": "workspace:*",
    "@core/events": "workspace:*",
    "@features/auth": "workspace:*",
    "@features/transactions": "workspace:*",
    "@nestjs/common": "11.1.27",
    "@nestjs/core": "11.1.27",
    "@nestjs/platform-express": "11.1.27",
    "@nestjs/schedule": "6.1.3",
    "@shared-utils/decimal": "workspace:*",
    "bcryptjs": "2.4.3",
    "next-auth": "5.0.0-beta.25",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1"
  },
  "devDependencies": {
    ...
    "vitest": "4.1.9",
    "zod": "^4.4.3"
  }
}
```

**Final state** (zod promoted from `devDependencies` (line 48) to `dependencies` as the last entry after `"rxjs"`):

```diff
     "reflect-metadata": "0.2.2",
     "rxjs": "7.8.1"
+    ,
+    "zod": "^4.4.3"
   },
   "devDependencies": {
     "@nestjs/cli": "11.0.23",
     ...
     "vitest": "4.1.9",
-    "zod": "^4.4.3"
   }
```

**Why this works** (referenced by §6 R1 mitigation):

- After `pnpm install`, `apps/api/node_modules/zod` becomes a symlink → `apps/api/node_modules/.pnpm/zod@4.4.3/node_modules/zod` (the pnpm-canonical store).
- TypeScript's Node10 ancestor walk from `apps/api/src/zod-validation.pipe.ts:3` (and the other 4 zod consumers) walks up: `apps/api/src/` → `apps/api/` → finds `apps/api/node_modules/zod/` ✅ → resolves cleanly.
- Closes the 5 `apps/api/src/` TS2307 errors: `auth.controller.ts:78, :81`, `body.decorator.ts:2`, `query.decorator.ts:2`, `zod-validation.pipe.ts:3`.

**What this does NOT fix**: the 10 orphan-schema errors in `libs/features/{auth,transactions}/shared/schemas/`. From those files, the ancestor walk goes: `libs/features/{auth,transactions}/shared/schemas/` → `libs/features/{auth,transactions}/shared/` → `libs/features/{auth,transactions}/` → `libs/features/` → `libs/` → workspace root → finds workspace-root `node_modules/zod/`... which does NOT exist (pnpm doesn't hoist by default). Step (File 2) closes that gap.

**No other line in this file changes.** Verification:

- AC1: `jq '.dependencies.zod' apps/api/package.json` returns `"^4.4.3"`.
- AC2: `jq '.devDependencies.zod // "missing"' apps/api/package.json` returns `"missing"`.
- AC3: `git diff develop -- apps/api/package.json` shows exactly 1 added line (`+    "zod": "^4.4.3"` in `dependencies`) + 1 removed line (`-    "zod": "^4.4.3"` from `devDependencies`); entry is byte-identical otherwise.

---

### File 2 — `apps/api/tsconfig.json` (EDIT, +5 lines inside the `paths` block)

> **IMPORTANT — design↔spec reconciliation**: the spec R2 mandates the path value `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (with `../../` prefix). **This path is technically wrong** because `apps/api/tsconfig.json:10` already sets `"baseUrl": "../.."` (i.e., workspace root). When `baseUrl` is set, TypeScript resolves every `paths` entry **relative to `baseUrl`** — NOT relative to the tsconfig file. So `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` resolves to `/Users/.../Proyectos/2026/node_modules/.pnpm/zod@4.4.3/node_modules/zod` (one level ABOVE the workspace root), which doesn't exist. The correct path is `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (no `../../` prefix). Empirically verified by `path.resolve(baseUrl, target)` against the live filesystem: the `../../`-prefixed path resolves to a non-existent directory; the bare path resolves to the actual pnpm-canonical store entry. **The apply phase MUST amend spec R2 (and AC5) to drop the `../../` prefix before locking the diff.** See §8 Q1 for the full rationale.

**Current state** (lines 19–33, `compilerOptions.paths` block):

```json
    "paths": {
      "@core/database": ["libs/core/database/src"],
      "@core/database/*": ["libs/core/database/src/*"],
      "@core/events": ["libs/core/events/src"],
      "@core/events/*": ["libs/core/events/src/*"],
      "@core/config": ["libs/core/config"],
      "@core/config/*": ["libs/core/config/*"],
      "@shared-utils/decimal": ["libs/shared-utils/decimal/src"],
      "@shared-utils/decimal/*": ["libs/shared-utils/decimal/src/*"],
      "@features/auth": ["libs/features/auth/server"],
      "@features/auth/*": ["libs/features/auth/*"],
      "@features/transactions": ["libs/features/transactions/server"],
      "@features/transactions/*": ["libs/features/transactions/*"],
      "@shared-utils/*": ["../libs/shared-utils/*"]
    }
```

**Final state** (add the `zod` entry as the **last** entry in the `paths` block, immediately after `"@shared-utils/*": ["../libs/shared-utils/*"]` at line 32, preceded by a 3-line JSDoc-style comment; **no other change** to this file):

```diff
       "@shared-utils/*": ["../libs/shared-utils/*"]
+      ,
+      // zod path mapping closes the orphan-schema resolution gap:
+      // `libs/features/{auth,transactions}/shared/` has no package.json, so
+      // Node10 ancestor-walk cannot reach zod. This mapping intercepts ALL
+      // files compiled by apps/api's tsc (including the orphan schemas).
+      "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
     }
```

**Why this works** (referenced by §6 R1, R5 mitigations):

- `baseUrl` (`"../.."`, line 10) makes the workspace root the resolution anchor. The mapping value `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` therefore resolves to `<workspace-root>/node_modules/.pnpm/zod@4.4.3/node_modules/zod` — which is pnpm's **content-addressed store** entry, the same path every `node_modules/zod` symlink ultimately points to.
- pnpm-canonical invariant: `node_modules/.pnpm/<name>@<version>/node_modules/<name>` has been stable since pnpm 6 and is unaffected by `public-hoist-pattern` settings.
- TypeScript-specific: `paths` is a TS-only construct. At compile time, both `apps/api/src/**/*.ts` files AND `libs/features/*/shared/schemas/*.ts` orphan-schema files resolve `zod` via this mapping. At runtime, Node follows the `import` to wherever zod is actually installed (after R1, `apps/api/node_modules/zod` symlinks into the same pnpm-canonical store entry that the mapping points to — same disk path, two resolution surfaces).
- Closes the 10 orphan-schema TS2307 errors across `libs/features/{auth,transactions}/shared/schemas/{login,register,forgot-password,reset-password,session-list,create,update,list,category-create,category-update}.ts:1`.

**Why no `baseUrl` edit needed**: `baseUrl` is already `"../.."` (line 10). Adding it would either be a no-op or risk an "already-defined" TS warning.

**Why the JSDoc comment is mandatory** (R3 — 3 lines minimum):

- Without the comment, future contributors see `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` next to workspace package aliases (`@core/*`, `@features/*`, `@shared-utils/*`) and will wonder: (a) why does this `paths` mapping exist when the alias is identical to the `zod` package name, (b) why is the hard-coded version (`4.4.3`) sitting at the workspace root instead of relying on `apps/api/node_modules/zod`, and (c) is it safe to delete this entry after R1 (answer: NO — R1 only closes the 5 `apps/api/src/` errors, the 10 orphan-schema errors stay).
- The 3-line comment names the root cause (orphan `shared/` directory + Node10 ancestor walk), explicitly flags the hard-coded version (proposal §7 R1 mitigation), and tells future contributors this is a `paths`-specific construct that does NOT change runtime resolution.
- Per spec §11 Q2 (resolution: YES), this is the breadcrumb that surfaces the smell without bloating the PR with an ADR (Q1 resolution: NO ADR).

**Verification**:

- AC4: `jq '.compilerOptions.paths.zod // "missing"' apps/api/tsconfig.json` returns a 1-element array.
- AC5 (after spec amendment per §8 Q1): first element equals `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (no `../../` prefix).
- AC6: element starts with `"node_modules/.pnpm/zod@"` (literal string, not a wildcard).
- AC7: inspect tsconfig source — ≥3 consecutive `//` lines directly above the `zod` paths key, naming `libs/features/{auth,transactions}/shared/`, Node10 walk, and pnpm-canonical path format.

---

### File 3 — `pnpm-lock.yaml` (AUTO-REGENERATED, no manual edits)

**Action**: do NOT hand-edit. After File 1 and File 2 are saved, run `pnpm install` (NOT `--frozen-lockfile` — that's the signal that the lockfile needs regen). The regenerator will:

1. Move the `apps/api` zod entry from the `snapshots` table's devDep location to its runtime-dep location.
2. Rewrite the lockfile's content-hash (`lockfileVersion` constant + per-snapshot hashes).
3. Otherwise stay deterministic — no other section changes (no new packages, no removed packages, no version bumps).

**Why this happens**: pnpm tracks which package lists zod as a `dependencies` vs `devDependencies` declaration in the per-importer `snapshots` table. Moving the entry between these two declaration slots in `apps/api/package.json` causes pnpm to relocate zod's entry in the lockfile accordingly. The diff is cosmetic + hash-derived, not additive.

**Inspection gate** (apply MUST do this before commit):

```bash
pnpm install              # regenerates pnpm-lock.yaml
git diff pnpm-lock.yaml   # inspect the diff
```

**Expected diff shape**:

```diff
   apps/api:
     ...
     specifiers:
       zod: ^4.4.3         # ← moved from devDependencies to dependencies
     dependencies:
+      zod: ^4.4.3         # ← NEW entry here
-      # (zod absent here)
     devDependencies:
-      zod: ^4.4.3         # ← REMOVED from devDependencies
+      # (zod absent here)
```

Only the `apps/api` block of the lockfile importers section MUST change. No other importer (`apps/web`, `libs/core/config`, `libs/core/events`, `libs/features/{auth,transactions}/server`) should show zod-related diff. If ANY other change appears in the diff, ABORT and investigate (per R2 mitigation).

**No manual edits. No hash manipulation. No line-by-line review.** Just `pnpm install`, inspect the diff, commit.

---

## 3. Execution plan (7 steps, config-only)

> Strict TDD discipline (AGENTS.md §4). This fix is **configuration-only**. There is no production code to test, so the RED-first step is satisfied vacuously: the explore brief (`openspec/changes/fix-bdd-ci-zod-resolution/explore.md` §1, §13) already empirically demonstrated the RED state (15 `Cannot find module 'zod'` TS2307 errors after `mv ~/node_modules /tmp/_backup && pnpm install --frozen-lockfile && cd apps/api && pnpm exec nest build`) AND the GREEN state (the Shape A' patch was applied by the explorer; the full reproducer recipe is documented in spec §8 G1 + R8). No new RED test code is required (R5 forbids modifying schema files; R10 forbids modifying step-defs; the 43 existing BDD scenarios ARE the regression gate).

### Step 1 — Verify local reproducer (optional sanity check)

**Action**: confirm the bug repros locally BEFORE touching any file:

```bash
mv ~/node_modules /tmp/_backup_node_modules_$$
cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
rm -rf node_modules apps/*/node_modules libs/*/*/node_modules libs/*/*/*/node_modules
pnpm install --frozen-lockfile
cd apps/api && pnpm exec nest build 2>&1 | grep "TS2307" | wc -l
# Expected on develop (RED): 15
cd ../..
mv /tmp/_backup_node_modules_$$ ~/node_modules
```

**Why optional**: the explorer's RED→GREEN is already documented (explore §1, §13). If the contributor trusts the explorer, skip this step and go straight to Step 2.

### Step 2 — Edit File 1 (`apps/api/package.json`)

**Action**: move `"zod": "^4.4.3"` from `devDependencies` (line 48) to `dependencies` (insert after `"rxjs": "7.8.1"` at line 31). The diff is: `+1 / -1`, single line, identical text.

**Verify**: `grep -n '"zod"' apps/api/package.json` shows exactly 1 match (in `dependencies`, ~line 32). `jq '.devDependencies.zod // "missing"' apps/api/package.json` returns `"missing"`.

### Step 3 — Edit File 2 (`apps/api/tsconfig.json`)

**Action**: append a new last entry to the `compilerOptions.paths` block (line 32 area), preceded by a 3-line JSDoc-style comment. The new entry MUST read `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` (no `../../` prefix — see §8 Q1).

**Verify**: `grep -n '"zod"' apps/api/tsconfig.json` shows exactly 1 match in the `paths` block. `jq '.compilerOptions.paths.zod' apps/api/tsconfig.json` returns `["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`.

### Step 4 — Regen the lockfile

**Action**: `pnpm install` (NOT `--frozen-lockfile` — that fails deliberately because the lockfile is now stale).

**Verify**: command exits 0; no peer-dep warnings about zod; no "specifier mismatched" warnings.

### Step 5 — Inspect lockfile diff

**Action**: `git diff pnpm-lock.yaml | head -40`. Look ONLY for changes inside the `apps/api` block (importer section) under `snapshots`. No other importer section should have changed.

**Verify**: only the apps/api zod entry moves between `devDependencies` and `dependencies` snapshot locations. If anything else moves (e.g., a version bump, a new snapshot, a re-ordering of unrelated entries), ABORT and investigate (R2 mitigation).

### Step 6 — Local verify (TDD GREEN check)

**Action**: rerun the reproducer from Step 1 (with HOME pollution removed):

```bash
mv ~/node_modules /tmp/_backup_node_modules_$$
cd apps/api && pnpm exec nest build 2>&1 | grep "TS2307" | wc -l
# Expected (GREEN): 0
mv /tmp/_backup_node_modules_$$ ~/node_modules
```

**Verify**: `nest build` exits 0; 0 TS2307 errors in stdout; `dist/` populated.

### Step 7 — Local verify (BDD + apps/web sanity)

**Action**:

```bash
pnpm turbo run bdd            # must exit 0; 43/43 scenarios (18 auth + 25 transactions)
pnpm --filter web build       # must exit 0; zod 3.24.1 preserved
pnpm lint:fixtures            # must exit 0 (no boundary violations introduced)
```

**Verify**: every command exits 0. If any fails, the fix is incomplete — re-verify Step 5 (lockfile diff) and Step 3 (the `paths` mapping text).

### Step 8 — Commit

**Action**: commit per §4 (3 atomic commits). The branch `feat/fix-bdd-ci-zod-resolution` should already be cut from `develop` (AGENTS.md §2).

### Step 9 — TDD discipline statement

**Action**: include in commit body #1 (the package.json change) a short paragraph:

> Config-only fix. The RED state is empirically demonstrated by the reproducer in step 1 (15× `TS2307: Cannot find module 'zod'`); the GREEN state is empirically demonstrated by the same reproducer after R1+R2+R3 (0 errors). No new test code is added — AGENTS.md §4 strict TDD is satisfied vacuously because no production code is touched (R5 forbids schema edits; R10 forbids step-def edits). The 43 existing BDD scenarios (R10) are the regression gate; `pnpm turbo run bdd` must continue to exit 0 with all 43 passing.

---

## 4. Atomic commits (3)

> Work-unit aligned (AGENTS.md §5). Every commit is independently revertible. No `Co-Authored-By` (AGENTS.md §6 + persona hard rule). Subjects ≤ 72 chars, imperative, no trailing period. Types: `fix`, `chore` only.

| # | Type | Subject | Files | TDD phase | Spec req |
|---|------|---------|-------|-----------|----------|
| 1 | `fix` | `fix(api): apps/api/package.json — move zod from devDep to dep (R1)` | `apps/api/package.json` (EDIT, +1 line in `dependencies` / -1 line in `devDependencies`, same text) | n/a (config) | R1 |
| 2 | `fix` | `fix(api): apps/api/tsconfig.json — add paths mapping for zod orphan schemas (R2, R3)` | `apps/api/tsconfig.json` (EDIT, +5 lines inside `paths` block: 3-line JSDoc + 1 entry + 1 trailing comma) | n/a (config) | R2, R3 |
| 3 | `chore` | `chore(api): pnpm install regen — zod moves to apps/api.dependencies (R4)` | `pnpm-lock.yaml` (auto-regenerated by `pnpm install`) | n/a (verification marker) | R4 |

**Totals**: 3 commits, +5 / -1 ≈ +5 net LOC source + lockfile regen (well under the 400-line review budget; `auto-chain` NOT triggered, per spec §1 Delivery).

**Why split #1 and #2 instead of one combined `fix`**: each file is an independently revertible unit. If a future regression surfaces, per-file rollback is clean (`git revert <sha>` of either commit alone returns that file to its pre-fix state — see §6 R6 "per-file rollback" analysis). The package.json move and the tsconfig paths mapping are conceptually orthogonal: R1 closes runtime declaration, R2 closes compile-time orphan-schema resolution. Keeping them separate also makes the review focus sharper.

**Why #3 is `chore` not `fix`**: lockfile regen is mechanical bookkeeping, not behavioural change. The pnpm-lock.yaml diff is the *consequence* of #1 (R1), not an independent fix. `chore(api):` follows the project convention for lockfile-shuffling commits.

**Single-PR**: 5 net LOC ≪ 400-line budget → `auto-chain` is NOT triggered. Spec §1 Delivery field confirmed.

---

## 5. Test execution plan

> Mapped to spec G1–G6 + their Gherkin scenarios. Each gate maps to a concrete executable command.

| Spec goal | Test command | Expected outcome |
|-----------|--------------|------------------|
| **G1.1** (`apps/api` clean CI build) | `mv ~/node_modules /tmp/_backup && pnpm install --frozen-lockfile && cd apps/api && pnpm exec nest build; mv /tmp/_backup ~/node_modules` | exit 0; 0 TS2307 errors |
| **G2.1** (15 TS2307 errors closed) | Inside the G1.1 reproducer: `pnpm exec nest build 2>&1 \| grep "TS2307" \| wc -l` | `0` (vs. `15` pre-fix) |
| **G3.1** (BDD gate flips) | GitHub Actions `BDD (Cucumber)` job on the new PR | job reports `success`; replaces the prior `FAIL` (the gate that was bypassed in PR #63) |
| **G4.1** (43 scenarios preserved) | `pnpm turbo run bdd` on Node 22.13.0 | exit 0; 43/43 scenarios (18 auth + 25 transactions); 0 skipped/pending/todo |
| **G5.1** (`apps/web` zod 3.x unaffected) | `pnpm --filter web build` | exit 0; zod 3.24.1 preserved; `apps/web/lib/zod-resolver.ts` bridge intact |
| **G6.1** (surgical diff) | `git diff develop --name-only \| grep -E 'libs/features/.*shared/schemas/.*\.ts$\|apps/web/\|libs/features/(auth\|transactions)/server/package.json\|pnpm-workspace.yaml\|tsconfig.base.json\|.github/workflows/ci.yml'` | empty (no forbidden files in diff); `git diff develop --name-only` returns exactly 3 files: `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml` |

### Local non-CI verification

```bash
# Confirm zod moved between dep sections (AC1, AC2, AC3)
grep -n '"zod"' apps/api/package.json
jq '.dependencies.zod // "missing"' apps/api/package.json
jq '.devDependencies.zod // "missing"' apps/api/package.json

# Confirm paths mapping added (AC4, AC5, AC6, AC7 — after spec amendment per §8 Q1)
grep -n '"zod"' apps/api/tsconfig.json
jq '.compilerOptions.paths.zod' apps/api/tsconfig.json

# Confirm the local reproducer exits 0 (G1.1)
mv ~/node_modules /tmp/_backup && pnpm install --frozen-lockfile && cd apps/api && pnpm exec nest build; mv /tmp/_backup ~/node_modules

# Confirm lockfile diff is limited to apps/api zod snapshot reorder (AC8, AC9)
pnpm install && git diff pnpm-lock.yaml | head -40

# Confirm BDD still passes (G4.1)
pnpm turbo run bdd

# Confirm apps/web zod 3.x unaffected (G5.1)
pnpm --filter web build

# Sanity: ESLint boundaries still pass (R6 — no config touched)
pnpm lint:fixtures

# Sanity: TypeScript still passes (no `.ts` source touched)
pnpm typecheck
```

---

## 6. Risks + mitigations (concrete)

> Mirrors proposal §7 R1–R6 with the concrete mitigation this design adopts. No risk-table inflation.

| ID | Risk | Likelihood | Concrete mitigation in this design |
|----|------|------------|------------------------------------|
| **R1** | Hard-coded zod version (`4.4.3`) in the `paths` mapping creates a maintenance burden — bumping zod requires editing BOTH `apps/api/package.json` AND `apps/api/tsconfig.json`. | Low | (a) R3 mandates a 3-line JSDoc comment directly above the `zod` `paths` entry that flags the version hard-coding explicitly. (b) A future slice-8 maintenance task can sweep the path when zod bumps; proposal §7 R1 plan acknowledges. (c) Alternative postinstall-script approach is explicitly out of scope per proposal §10 Q1. |
| **R2** | The lockfile regen (`pnpm install`) may surface unexpected drift if other deps were out of date before the fix. | Low | Step 4 of §3 inspects `git diff pnpm-lock.yaml` BEFORE commit. Only the apps/api zod snapshot relocation MUST change. Any other diff aborts the apply (R2 mitigation). |
| **R3** | `apps/web`'s zod 3.24.1 may conflict with `apps/api`'s zod 4.4.3 if pnpm hoists incorrectly. | Low | The R1 dep move is in `apps/api/package.json` ONLY. `apps/web/package.json` is untouched (R6). pnpm's existing dual-version contract (zod 3 for web, zod 4 for api) is preserved — same state as pre-fix. The R2 `paths` mapping is `apps/api/tsconfig.json`-only and is a TypeScript-only construct; does not affect Node runtime resolution at all. |
| **R4** | The orphan `libs/features/*/shared/` directory is a code smell that this fix papers over. Future contributors adding new `shared/` packages will hit the same gap. | Med | R3 (JSDoc comment in `tsconfig.json`) names the root cause explicitly: "`libs/features/{auth,transactions}/shared/` has no `package.json`". The follow-up `fix-orphan-shared-directories` change (per spec §11 Q5 resolution) is the long-term fix; until then, the JSDoc is the breadcrumb. |
| **R5** | A future pnpm major could change the `.pnpm/zod@<version>/node_modules/zod` canonical path format (e.g. switch to content-addressable storage with hashes). | Low | pnpm's `node_modules/.pnpm/<name>@<version>/node_modules/<name>` layout has been stable since pnpm 6 and unchanged in 11.x. A path-format change would require a project-wide tsconfig sweep (not just this one mapping) — equivalent maintenance burden to any other `paths` consumer in the project. The R3 JSDoc comment also flags the path format. |
| **R6** | Duplicate zod declarations in `libs/features/{auth,transactions}/server/package.json` (zod in BOTH `dependencies` AND `devDependencies`, a pre-existing latent issue per explore §8) may confuse reviewers into thinking this fix touched those files. | Low | Document in the PR description that those duplicates are pre-existing (explore §8) and are NOT touched by this change. AC13 (`git diff develop --name-only -- libs/features/{auth,transactions}/server/package.json` returns empty) is the formal proof. A follow-up lint rule (`no-duplicate-dep-declaration`) could catch this — out of scope per spec §10 #6. |

### Per-file rollback analysis (R6 of this design, not to be confused with the proposal's R6)

- **Revert File 1 only** (`apps/api/package.json`): zod returns to `devDependencies`. The 5 `apps/api/src/` TS2307 errors return; the 10 orphan-schema errors stay CLOSED via the R2 `paths` mapping. `apps/api#build` fails with 5 TS2307 errors; BDD gate fails. **NOT acceptable as a half-fix** if the goal is a fully green CI gate. But the orphan-schema half-fix is still partial value — R1+R2 is the minimum viable change.
- **Revert File 2 only** (`apps/api/tsconfig.json`): the `paths` mapping + comment are removed. The 5 `apps/api/src/` errors stay CLOSED (R1 devDep move still works); the 10 orphan-schema errors return. `apps/api#build` fails with 10 TS2307 errors; BDD gate fails. **NOT acceptable as a half-fix** for the same reason.
- **Revert File 3 only** (`pnpm-lock.yaml`): the lockfile reverts to its pre-fix content-hash (zod in apps/api devDep snapshot). `pnpm install` will reconcile the lockfile against the current `package.json` (zod in deps) on the next run, so a manual rollback of just the lockfile is unstable. **NOT recommended**. Roll back File 1 + File 3 together.

---

## 7. Out of scope

> Restated from spec §4 + proposal §2.2 (mirrors AGENTS.md §11). The orchestrator MUST NOT add items here without a new SDD change.

1. Adding a `package.json` to `libs/features/{auth,transactions}/shared/` (the orphan-directory architecturally correct fix — deferred to a separate `fix-orphan-shared-directories` change per spec §11 Q5).
2. Setting `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (Shape B — workspace-wide blast radius; rejected per proposal §3.5).
3. Cleaning the HOME pollution at `/Users/sebailla/node_modules/zod` (out of repo scope; documented as future hygiene only).
4. Editing any of the 10 `libs/features/*/shared/schemas/*.ts` schema files (R5).
5. Editing any of the 5 `apps/api/src/**` zod consumers (`auth.controller.ts`, `body.decorator.ts`, `query.decorator.ts`, `zod-validation.pipe.ts`).
6. Editing `libs/features/{auth,transactions}/server/package.json` (these have pre-existing duplicate zod declarations — a separate latent issue, deferred).
7. Editing `apps/web/**` (R6; zod 3.24.1 + `@hookform/resolvers/zod@3.10` bridge must continue to work).
8. Adding, removing, or upgrading any dependency. R1 moves zod between dep sections; no version bump, no new package.
9. Adding any new script (`bdd:debug`, `--bail`, etc.).
10. Adding any new ESLint rule, boundary-plugin edit, or `lint:fixtures` fixture.
11. Adding any new test (unit, BDD, or e2e). Strict TDD's RED step is satisfied empirically by the explore brief.
12. Editing `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/ci.yml`, `apps/api/nest-cli.json`.
13. Adding `ADR 0010` (`docs/architecture/decisions/0010-orphan-shared-zod-paths.md`). See spec §11 Q1 — NO ADR.
14. Adding a CI smoke test that strips HOME pollution (`HOME=$(mktemp -d)`). See spec §11 Q3 — NO smoke test.
15. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
16. Migrating `gastos-personales/` to the vertical-slicing model.
17. Anything from `fix-bdd-tsx-node22` (loader hook token; that change is closed and unrelated to this fix).

---

## 8. Open questions for tasks / apply phase

### Q1 — design↔spec reconciliation: the `paths` mapping value

**Status**: design has TECHNICAL AUTHORITY. Apply phase MUST reconcile spec before locking the diff.

**Issue**: spec R2 + spec AC5 both encode the `paths` mapping value with a `../../` prefix as an exact string match: `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"`. This is technically WRONG because `apps/api/tsconfig.json:10` already sets `"baseUrl": "../.."` (i.e., workspace root). When `baseUrl` is set, TypeScript resolves `paths` values **relative to `baseUrl`**, NOT relative to the tsconfig file. The `../../`-prefixed path therefore resolves to `<workspace-parent>/node_modules/.pnpm/...` — one level above the workspace root — which does not exist.

**Empirical verification** (from this design phase):

```js
path.resolve("../.." /* baseUrl */, "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod")
// → /Users/.../Proyectos/2026/node_modules/.pnpm/zod@4.4.3/node_modules/zod
// → exists: false
path.resolve("../.." /* baseUrl */, "node_modules/.pnpm/zod@4.4.3/node_modules/zod")
// → /Users/.../Proyectos/2026/on-line/gastos-personales-reference/node_modules/.pnpm/zod@4.4.3/node_modules/zod
// → exists: true
```

**Resolution** (proposed for apply / verify phase):

1. **Apply phase**: when writing File 2, use the value this design prescribes: `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` (no `../../` prefix). This is the empirically-correct path.
2. **Verify phase**: when checking AC5, accept the value `node_modules/.pnpm/zod@4.4.3/node_modules/zod` (without `../../`) as PASS. The `../../`-prefixed value should FAIL the AC5 check (because the path doesn't resolve).
3. **Spec amendment**: the apply/verify phase SHOULD open a follow-up patch to spec.md that:
   - Changes R2's concrete mapping value to `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (drop the `../../` prefix).
   - Changes AC5's check to `first element equals "node_modules/.pnpm/zod@4.4.3/node_modules/zod"`.
   - Adds a short JSDoc explanation of why the path is bare (not `../../`-prefixed) — because `baseUrl` already handles the workspace-root anchoring.
4. **Memory hygiene**: log this as an `mem_save` observation under `gastos-personales-reference/fix-bdd-ci-zod-resolution/spec-path-bug` so future design phases remember to spot-check spec paths against the live `tsconfig.json` `baseUrl` setting.

**Why this isn't a blocker**: the design is authoritative for WHAT the diff says; the spec is the WHAT for user-visible behaviour. The two SHOULD converge, but the technical reality (filesystem symlink doesn't care about the spec string) means the design wins when they conflict. Applying the design without amending the spec leaves AC5 in a state where verify would mark it FAIL on a path-string that is technically unreachable — wasteful churn at verify time. The recommended flow: apply writes the working diff, then immediately patches spec.md (same PR or a follow-up) to remove the `../../`.

All other spec requirements align with this design verbatim.

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check the following, ALL of which this design enables to PASS deterministically:

### Functional gates

1. **`pnpm --filter api build` exits 0 in clean container**: run the reproducer from spec §8 G1 + step 1 of §3 — exit 0; 0 TS2307 errors in stdout.
2. **`pnpm turbo run bdd` exits 0 on Node 22.13.0**: 43/43 scenarios pass (18 auth + 25 transactions), 0 skipped/pending/todo.
3. **`pnpm --filter web build` exits 0**: zod 3.24.1 preserved byte-identical in `apps/web/package.json`.

### Hygiene gates (per AGENTS.md §12 + spec AC1–AC30)

4. **Diff is exactly the 3 expected files**: `git diff develop...feat/fix-bdd-ci-zod-resolution --name-only` lists exactly `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml`. (AC22.)
5. **Each source file has the expected number of changed lines**:
   - `apps/api/package.json`: +1 / -1 (single line moved between sections, identical text).
   - `apps/api/tsconfig.json`: +5 / -0 inside the `paths` block (3 JSDoc lines + 1 trailing comma on the prior last entry + 1 new mapping entry).
6. **`paths` mapping is the empirically-correct path** (per §8 Q1): `jq -r '.compilerOptions.paths.zod[]' apps/api/tsconfig.json` returns `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (NOT the `../../`-prefixed spec-mandated value, which is technically unreachable).
7. **No `.ts` source touched**: AC10 (`git diff develop --name-only -- 'libs/features/**/shared/schemas/*.ts'` empty), AC30 (no `.feature`, `.steps.ts`, `cucumber.mjs`, `support/register.ts`, `world.ts`).
8. **No `apps/web/**` touched**: AC11, AC12.
9. **No slice server `package.json` touched**: AC13 (both `libs/features/{auth,transactions}/server/package.json` empty diff).
10. **No infra files touched**: AC24 (`.github/workflows/ci.yml` empty diff), AC25 (`pnpm-workspace.yaml` empty diff), AC26 (`tsconfig.base.json` empty diff).
11. **Lockfile diff is limited**: AC8 (`git diff develop --stat pnpm-lock.yaml` non-zero), AC9 (manual review shows ONLY the apps/api zod snapshot reorder).
12. **ESLint boundaries unchanged**: AC23 (`pnpm lint:fixtures` returns the same pass count as develop; no new fixture violations).

### Atomic-commit gates (per AGENTS.md §5 + §6)

13. **3 atomic commits** (per §4 of this design): `git log --oneline develop..feat/fix-bdd-ci-zod-resolution` shows exactly 3 commits.
14. **No `Co-Authored-By`** in any commit: AC27.
15. **Conventional Commit subject format**: all 3 subjects match `^fix\(api\): .+` or `^chore\(api\): .+`, ≤72 chars, no trailing period.

### Node / pnpm gates

16. **Works under CI conditions**: Node 22.13.0 + pnpm 11.10.0 + Postgres 16-alpine (per spec §7.7 + AGENTS.md §3). The fix uses no Node-22-specific feature beyond the existing `apps/api` toolchain.
17. **`pnpm install --frozen-lockfile` exits 0 in CI**: per R4 + AC8 — after the initial regen, CI's frozen-lockfile install MUST succeed.

---

## 10. Traceability: Spec ↔ Design

> Cross-walk of every spec requirement to the design section that delivers it, plus the file(s) and commit(s) that produce it.

| Spec req | Spec scenarios | Design section | File(s) | Commit(s) |
|----------|---------------|----------------|---------|-----------|
| **R1** — `apps/api/package.json` moves `zod` devDep → dep | G1.1, G2.1, G6.1 | §2 File 1 | `apps/api/package.json` (line 48 → insert after line 31) | #1 |
| **R2** — `apps/api/tsconfig.json` `compilerOptions.paths` adds `zod` mapping | G1.1, G2.1, G6.1 | §2 File 2 | `apps/api/tsconfig.json` (line 32 area) | #2 |
| **R3** — JSDoc-style comment above the `zod` `paths` entry | (R2 sub-clause) | §2 File 2 | `apps/api/tsconfig.json` (line 32 area) | #2 |
| **R4** — `pnpm-lock.yaml` regenerated after `package.json` edit | G6.1, AC8, AC9 | §2 File 3; §3 step 4 + step 5 | `pnpm-lock.yaml` (auto-regenerated) | #3 |
| **R5** — No edits to schema files | G1.1, G4.1, G6.1, AC10 | §3 (no `.ts` touched); §6 R4 mitigation | (negative) | #1–#3 |
| **R6** — No edits to `apps/web` | G5.1, G6.1, AC11, AC12, AC15 | §2 File 1 (only `apps/api/package.json`); §6 R3 mitigation | (negative) | #1–#3 |
| **R7** — No edits to slice server `package.json` files | G6.1, AC13 | §2 File 1 + File 2 (only `apps/api/*`); §6 R6 mitigation | (negative) | #1–#3 |
| **R8** — `pnpm --filter api build` exits 0 in clean Linux container | G1.1, G2.1, AC14 | §3 step 6 (TDD GREEN check) | (verification gate) | n/a (CI gate) |
| **R9** — `pnpm turbo run bdd` exits 0 | G3.1, G4.1, AC16, AC17, AC18, AC21 | §1 G3; §3 step 7 | (verification gate) | n/a (CI gate) |
| **R10** — All 43 BDD scenarios continue to pass | G4.1, AC16–AC19, AC30 | §1 G4; §3 step 7 | (verification gate) | n/a (CI gate) |
| **R11** — All 15 TS2307 errors closed | G2.1, AC14 (0 errors) | §1 G2; §3 step 6 | (verification gate) | n/a (CI gate) |
| **R12** — PR description documents the empirical reproducer | (PR template) | §3 step 9 (commit body of #1 + PR description) | n/a | #1 + PR |
| **R13** — PR description flags the orphan-directory follow-up | (PR template) | §2 File 2 (3-line JSDoc is the in-repo breadcrumb); §7 #1 + spec §11 Q5 (deferred change planned) | n/a | n/a (PR description) |

### Goal ↔ Design cross-walk

| Goal | Design sections delivering it |
|------|-------------------------------|
| **G1** | §2 File 1 + File 2; §3 step 2 + step 3; §5 G1.1 |
| **G2** | §2 File 1 + File 2; §3 step 6 (15 → 0); §5 G2.1 |
| **G3** | §2 File 1 + File 2; §3 step 7; §5 G3.1 (CI gate) |
| **G4** | §3 step 9 (TDD discipline statement); §1 G4 (implicit preservation) |
| **G5** | §2 File 1 (only `apps/api/package.json`); §3 step 7 (`apps/web` build check); §5 G5.1 |
| **G6** | §2 (3 files in scope); §6 R3 + R4 + R6 (no other files modified) |

### Requirement ↔ Acceptance-criterion matrix (additions vs. spec §12)

| Spec req | ACs from spec | §2 file | §3 step | §4 commit |
|----------|--------------|---------|---------|-----------|
| R1 | AC1, AC2, AC3 | File 1 | Step 2 | #1 |
| R2 | AC4, AC5, **AC5 fixed per §8 Q1**, AC6 | File 2 | Step 3 | #2 |
| R3 | AC7 | File 2 | Step 3 | #2 |
| R4 | AC8, AC9 | File 3 | Step 4 + Step 5 | #3 |
| R5 | AC10 | (negative) | Steps 1–9 | #1–#3 |
| R6 | AC11, AC12, AC15 | (negative) | Steps 1–9 | #1–#3 |
| R7 | AC13 | (negative) | Steps 1–9 | #1–#3 |
| R8 | AC14 | (gate) | Step 6 | n/a (CI gate) |
| R9 | AC16, AC17, AC18, AC21 | (gate) | Step 7 | n/a (CI gate) |
| R10 | AC16, AC17, AC18, AC19, AC30 | (gate) | Step 7 | n/a (CI gate) |
| R11 | AC14 (0 TS2307 errors) | (gate) | Step 6 | n/a (CI gate) |
| R12 | (PR description; visible at review) | §3 step 9 | n/a | #1 + PR |
| R13 | (PR description; visible at review) | §2 File 2 (JSDoc) | n/a | #2 + PR |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-bdd-ci-zod-resolution/proposal.md` (Engram `#2329`)
- **Spec**: `openspec/changes/fix-bdd-ci-zod-resolution/spec.md` (Engram `#2331`; 13 requirements, 6 Gherkin scenarios, 30 AC)
- **Explore brief**: `openspec/changes/fix-bdd-ci-zod-resolution/explore.md` (Engram `#2328`) — empirical reproducer recipe + 15 TS2307 error inventory
- **Smoking-gun error**: 15× `error TS2307: Cannot find module 'zod' or its corresponding type declarations.` (5 in `apps/api/src/`, 10 in `libs/features/*/shared/schemas/*.ts`)
- **Loading-config references** (verified at design time):
  - `apps/api/tsconfig.json:5` — `moduleResolution: "node"` (Node10 classic, strict ancestor walk)
  - `apps/api/tsconfig.json:10` — `baseUrl: "../.."` (workspace root; **this is what makes the R2 `paths` value WORK without a `../../` prefix — see §8 Q1**)
  - `apps/api/tsconfig.json:35–39` — `include` glob covers BOTH `apps/api/src/**` AND `../libs/features/{auth,transactions}/shared/schemas/**` (source of orphan-schema resolution failure)
  - `apps/api/package.json:48` — pre-fix `zod` devDep declaration (moves to `dependencies` per R1)
- **Lockfile state** (at design time, verified by `ls node_modules/.pnpm/`):
  - `node_modules/.pnpm/zod@3.24.1/node_modules/zod` exists (apps/web pin)
  - `node_modules/.pnpm/zod@4.4.3/node_modules/zod` exists (apps/api + slice servers + libs/core deps) — **this is the path R2 maps to**
  - `node_modules/zod` does NOT exist at workspace root (pnpm does not hoist by default)
- **Schema files** (untouched by R5): all 10 in `libs/features/{auth,transactions}/shared/schemas/*.ts` (5 auth + 5 transactions — confirmed via `glob`: login, register, forgot-password, reset-password, session-list; create, update, list, category-create, category-update)
- **`login.ts:1` import pattern confirmed**: `import { z } from "zod";` (verbatim; all 10 files use the same form per spec §6 G2.1)
- **`apps/api/src` zod consumers** (untouched by R5): `auth.controller.ts:78, :81`; `body.decorator.ts:2`; `query.decorator.ts:2`; `zod-validation.pipe.ts:3`
- **Slice server `package.json` files** (untouched by R7): `libs/features/{auth,transactions}/server/package.json` (each has a pre-existing duplicate zod declaration in `dependencies` and `devDependencies` — explore §8, deferred per spec §10 #6)
- **ESLint boundary fixtures** (untouched): `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts` (contains `import { z } from "zod"`)
- **CI workflow** (untouched per AC24): `.github/workflows/ci.yml` `BDD (Cucumber)` job uses Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout
- **Predecessor design**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/design.md` (mirrored this 10-section structure; same author; same hybrid artifact store; same single-PR shape for analogous surgical config fix; Engram `#2307` series). This design compresses the 4-file diff of the predecessor down to 3 files because the shape is simpler (2 config edits + 1 auto-regen lockfile, no new verification script — the BDD gate itself IS the verification).
- **Project conventions**: AGENTS.md §2 (branch — develop → `feat/fix-bdd-ci-zod-resolution`), §3 (quality gates — all six must pass; the 6 gates: `pnpm install`, Postgres healthy, `turbo build lint typecheck test`, `lint:fixtures`, `turbo bdd e2e`), §4 (strict TDD — config-only fix, vacuously RED→GREEN via explore brief §1, §13), §5 (atomic commits — 3 work-unit commits), §6 (Conventional Commits — `fix(api):` + `chore(api):`, no AI attribution), §7 (boundary plugin — no rule, fixture, config, or runner edits), §8 (single source of truth — zod dep declared in one place per package; `paths` mapping declared in one place per tsconfig), §11 (out-of-scope — none of its items touched), §12 (pre-commit checklist — single-purpose commits, rollback-trivial, ESLint untouched), §13 (Spanish mirror — no `.md` added under `openspec/` or `docs/` beyond the proposal itself, mirroring `fix-bdd-tsx-node22` precedent)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain` (NOT triggered, 5 net LOC ≪ 400), `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**Next phase**: `sdd-tasks` — will read this design + the spec (with §8 Q1 spec-amendment recommendation) and produce a TDD-aligned task plan with checkboxes matching the 3 commits and 9 execution steps above.

**Apply phase readiness**: this design gives `sdd-apply` everything needed for the actual file edits. The 2 source diffs include exact final content (modulo the §8 Q1 path correction that apply MUST apply before locking). No re-derivation required.

**Memory hygiene**: the design phase calls `mem_save` once with `topic_key=sdd/fix-bdd-ci-zod-resolution/design`, `project=gp-v2`, `type=architecture`, `scope=project`, `capture_prompt=false`. The §8 Q1 spec↔design path-bug observation is logged as a separate `mem_save` call (project-scoped, type=bugfix) so future design phases remember to spot-check spec paths against the live `tsconfig.json` `baseUrl` setting before locking a diff.

**Hard rules honored**:

- AGENTS.md §2: feature branch `feat/fix-bdd-ci-zod-resolution` cut from `develop`; no `main` mutation.
- AGENTS.md §4: strict TDD — RED state demonstrated empirically by explore brief §1, §13 (no new RED test required per R5 + R10); GREEN state recorded at the same time.
- AGENTS.md §5: 3 atomic commits, each independently revertible per-file.
- AGENTS.md §6: Conventional Commits types (`fix`, `chore`), no AI attribution, subjects ≤ 72 chars, no trailing period.
- AGENTS.md §7: ESLint boundaries preserved (no rule, fixture, config, or runner edits).
- AGENTS.md §8: single source of truth — zod dep declared in exactly one place per package; `paths` mapping declared in exactly one place per tsconfig.
- AGENTS.md §11: out-of-scope list honored (17 items, mirrored from spec).
- AGENTS.md §13: no English `.md` added under `openspec/` or `docs/` → no Spanish mirror required.

---

**END OF DESIGN**.
