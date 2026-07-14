# Tasks — `fix-bdd-tsx-node22` — `gastos-personales-reference`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/fix-bdd-tsx-node22` (off develop)
**Artifact store**: hybrid (openspec files + Engram)
**Mode**: auto (gatekeeper validates between phases)
**Date**: 2026-07-14
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Status**: Planning complete; user will pause before sdd-apply
**PR count**: 1 (2 net source LOC + ~30 LOC verify script; well under 400-line review budget)

> Single-token-per-line swap (`tsx/esm` → `tsx/cjs`) in two slice `package.json` files, plus a 30-line verify script. The empirical RED→GREEN evidence is recorded in `openspec/changes/fix-bdd-tsx-node22/explore.md` §5 + §10 (18/18 auth scenarios passing in 0.34s on Node 22.14.0 with the CJS hook). Strict TDD's RED step is satisfied vacuously: no production code is touched, so the BDD runner itself is the regression gate (R7 + R8).

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Config-only fix; tests land in the same commit as the behavior they verify (here: the BDD runner).
- **No "Co-Authored-By"** trailers (AGENTS.md §6 + persona hard rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: vacuously satisfied — the failure mode (`SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule`) is empirically documented in `explore.md` §5; no new failing-test code is required.
- **No Spanish mirror required**: no English `.md` files are added under `openspec/` or `docs/` (AGENTS.md §13; design §7.6).
- **MUST / SHALL / MUST NOT** are RFC 2119; anything weaker (should, may) is non-binding.
- The 4 tasks below map **1:1** to the 4 atomic commits in `design.md` §4. **No 5th commit. No merging.**

---

## §1. Dependency graph

```
T1 (auth package.json — tsx/esm → tsx/cjs)        independent
T2 (transactions package.json — tsx/esm → tsx/cjs) independent
                    │
                    ▼
T3 (verify.sh + bdd:verify wiring) — depends on T1+T2 (so the script verifies them)
                    │
                    ▼
T4 (chore verify — turbo bdd 43/43 on Node 22) — depends on T1+T2+T3
```

**Execution order invariant**: `T1 ║ T2` (parallelizable — different files, no shared state) → `T3` → `T4`. The orchestrator sequences as `T1 → T2 → T3 → T4` because T4's verification must observe the cumulative state after T1+T2+T3.

---

## §2. Per-task tables (4 tasks)

### T1 — fix auth slice BDD script hook

| Field | Value |
|-------|-------|
| Commit | `fix(bdd): auth.server package.json — switch from tsx/esm to tsx/cjs (R1)` |
| Files | `libs/features/auth/server/package.json` (EDIT, +1 / -1 on line 17) |
| Depends on | — (independent of T2; different file path) |
| LOC | +1 / -1 |
| TDD | n/a (config-only). RED state documented in `explore.md` §5 (`SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule` on Node 22.13.0/22.14.0 with `tsx/esm`). GREEN state observed empirically with `tsx/cjs` (18/18 scenarios, 101/101 steps in 0.34s). |
| Verify | `pnpm --filter @features/auth bdd` MUST exit 0 on Node 22.x; stdout MUST report `18 scenarios (18 passed)` and `101 steps (101 passed)`. Pre-flight grep: `grep -n "tsx/cjs\|tsx/esm" libs/features/auth/server/package.json` → `tsx/cjs` (1 match), `tsx/esm` (0 matches). |

---

### T2 — fix transactions slice BDD script hook

| Field | Value |
|-------|-------|
| Commit | `fix(bdd): transactions.server package.json — switch from tsx/esm to tsx/cjs (R2)` |
| Files | `libs/features/transactions/server/package.json` (EDIT, +1 / -1 on line 17) |
| Depends on | — (independent of T1; different file path) |
| LOC | +1 / -1 |
| TDD | n/a (config-only). Same RED-state rationale as T1; transactions slice has the same `support/register.ts` + `cucumber.mjs` shape as auth (slice-7 PR-8). |
| Verify | `pnpm --filter @features/transactions bdd` MUST exit 0 on Node 22.x; stdout MUST report `25 scenarios (25 passed)` and step counts ≥137. Pre-flight grep: `grep -n "tsx/cjs\|tsx/esm" libs/features/transactions/server/package.json` → `tsx/cjs` (1 match), `tsx/esm` (0 matches). |

---

### T3 — local Node 22 BDD verification script + root wiring

| Field | Value |
|-------|-------|
| Commit | `feat(scripts): add scripts/bdd/verify.sh + pnpm bdd:verify (R10, R11)` |
| Files | `scripts/bdd/verify.sh` (NEW, ~30 LOC, `chmod +x`), `package.json` (EDIT, +1 LOC at line 21: `"bdd:verify": "bash scripts/bdd/verify.sh"`) |
| Depends on | T1 + T2 (the script is the local recipe for what T1+T2 made pass) |
| LOC | +31 / 0 |
| TDD | n/a (script-only). Verification is the script itself + the BDD pipeline. `set -euo pipefail` + `bash -n` syntax gate + executable bit are the binary checks. The `--no-node-check` escape hatch lets Node 23 contributors reproduce the gate (R3 + R4 mitigation). |
| Verify | `bash -n scripts/bdd/verify.sh` MUST exit 0 (AC9). `test -x scripts/bdd/verify.sh` MUST succeed (AC8). `grep "pnpm turbo run bdd" scripts/bdd/verify.sh` MUST show ≥1 match (AC10). `grep "bdd:verify" package.json` MUST show exactly 1 match. `ls scripts/bdd/verify.sh` MUST succeed (AC7). |

---

### T4 — verification marker (turbo bdd green on Node 22)

| Field | Value |
|-------|-------|
| Commit | `chore(bdd): verify pnpm bdd:verify exits 0 on Node 22 (R5 marker)` |
| Files | (no file changes — empty verification marker commit) |
| Depends on | T3 (must observe the cumulative state after T1+T2+T3) |
| LOC | 0 / 0 |
| TDD | n/a (gate marker). Records the binary R5 acceptance: `pnpm turbo run bdd` exits 0 on Node 22.13.0 with 43/43 scenarios. Body MUST cite the explore brief §5+§10 as the empirical RED→GREEN evidence (per spec §7.2 + design §3 step 7). The orchestrator MAY elide this commit at apply time if a CI check already attests the same fact; the design keeps it as an option. |
| Verify | `pnpm bdd:verify` MUST exit 0 on Node 22.13.0; stdout MUST report 18/18 auth + 25/25 transactions = 43/43 scenarios. `git log feat/fix-bdd-tsx-node22 --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (AC23). `bash scripts/bdd/verify.sh --no-node-check` on Node 23.x MUST exit 0 (backward-compat R3). |

---

## §3. PR plan (single PR)

**PR title**: `fix(bdd): swap tsx/esm to tsx/cjs hook in slice scripts (Node 22 BDD gate)`

**Branch**: `feat/fix-bdd-tsx-node22` (cut from `develop` at HEAD `ea7732f`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2)

**Merge strategy**: squash-merge at PR end. The 4-commit story lives in the PR description; the squash collapses to a single revertible change on `develop`.

**Pre-PR checklist**:

- [ ] All 4 commits land in order on `feat/fix-bdd-tsx-node22` (T1 → T2 → T3 → T4).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AC23).
- [ ] `pnpm turbo run bdd` exits 0 on Node 22.x (run locally before pushing).
- [ ] `pnpm bdd:verify` exits 0 on Node 22.x.
- [ ] 43/43 BDD scenarios pass (18 auth + 25 transactions).
- [ ] `bash scripts/bdd/verify.sh --no-node-check` on Node 23.x also exits 0 (backward-compat R3).
- [ ] The diff does NOT include any `.steps.ts`, `cucumber.mjs`, or `support/register.ts` file (grep gate per spec AC14-AC20).
- [ ] `git diff develop..feat/fix-bdd-tsx-node22 --name-only` lists exactly 4 files: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json`, `scripts/bdd/verify.sh`, `package.json`.
- [ ] `git diff develop --stat` reports ≈ +32 / -2 ≈ +30 net LOC (well under 400-line review budget).

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` — auto-slices on >400 LOC.
- **This change's effective strategy**: **single PR**. ~32 net LOC sits at ~8% of the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended**.
- **Branch**: `feat/fix-bdd-tsx-node22` cut from `develop` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa).
- **Risk profile**: 5 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1-R5); all have concrete mitigations already engineered into the 4 tasks (empirical RED→GREEN evidence in `explore.md` §5+§10; `tsx@^4.23.0` covers `>=4.16.0` for the `tsx/cjs` hook; Node 23 backward-compat via `--no-node-check`).

---

## §5. Apply order

1. **Create branch** `feat/fix-bdd-tsx-node22` off `develop@ea7732f`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-bdd-tsx-node22
   ```
2. **Apply the 4 commits** in dependency order per §2 above (T1 → T2 → T3 → T4). Each commit lands ATOMICALLY — never split, never squash mid-stream.
3. **Run local verification** on Node 22.13.0:
   ```bash
   pnpm bdd:verify                 # MUST exit 0; logs "node 22 + tsx 4.23.0"; runs turbo bdd
   pnpm turbo run bdd              # MUST exit 0; 43/43 scenarios
   ```
4. **Run backward-compat check** on Node 23.x (optional but recommended per design §3 step 6):
   ```bash
   nvm use 23
   pnpm bdd:verify --no-node-check # MUST exit 0 on Node 23 too
   nvm use 22                      # restore
   ```
5. **Pre-commit hygiene gates** (per AGENTS.md §12):
   ```bash
   pnpm lint:fixtures              # MUST exit 0; no ESLint changes
   pnpm typecheck                  # MUST exit 0; no .ts changes
   bash -n scripts/bdd/verify.sh   # MUST exit 0; script syntax
   ```
6. **Push the branch**:
   ```bash
   git push -u origin feat/fix-bdd-tsx-node22
   ```
7. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-bdd-tsx-node22 \
     --title "fix(bdd): swap tsx/esm to tsx/cjs hook in slice scripts (Node 22 BDD gate)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   PR body MUST lead with the one-line statement from spec R12: this restores the previously-broken BDD CI gate on `develop@ea7732f` (failing run `29288016689` → green on `feat/fix-bdd-tsx-node22`), citing the explore brief as empirical root-cause evidence.
8. **Wait for CI**. The BDD (Cucumber) job MUST go from `FAIL` (per run `29288016689`) to `PASS`.
9. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-bdd-tsx-node22   # after maintainer approval
   ```
10. **`sdd-verify` runs on `develop` post-merge** to confirm the gate stays green (43/43 scenarios, `pnpm bdd:verify` exits 0).
11. **`sdd-archive` moves** `openspec/changes/fix-bdd-tsx-node22/{explore,proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

(All 4 deferred from proposal §10 were resolved in `spec.md` §11.)

- **Q1 (ADR 0009 for loader hook choice)**: **NO ADR.** The change is a one-token-per-line swap between two official tsx entry points documented at <https://tsx.is/getting-started>; an ADR for a config tweak of this size is bureaucratic overhead. The proposal + spec + design + PR description already provide enough context. (`fix-api-nestjs-di` wrote ADR 0008 because that change introduced a new ESLint rule + `_ServiceAnchor` convention — a different scenario.)
- **Q2 (`bdd:debug` script with `--inspect`)**: **NO.** Scope creep; the existing `bdd` script is sufficient once it works on Node 22.
- **Q3 (CI `--bail` flag)**: **NO.** Out of scope; the BDD job runs all slices and reports a single exit code; fix is independent of CI fast-fail semantics.
- **Q4 (verification script for local reproduction)**: **YES** — `scripts/bdd/verify.sh` per R10, wired as `pnpm bdd:verify` per R11. ~30 LOC of cheap insurance; gives future maintainers a one-liner to reproduce the BDD gate.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 4 tasks above.

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §4 + `proposal.md` §2.2 + AGENTS.md §11.)

1. No new features.
2. No tsx version pin or upgrade; `^4.23.0` is sufficient.
3. No Node version change in CI; Node 22.13.0 stays the CI target.
4. No changes to any BDD step-def file (`libs/features/*/docs/step-defs/*.steps.ts`).
5. No changes to `cucumber.mjs` files (both slices).
6. No changes to `support/register.ts` files (both slices).
7. No changes to any `.feature` file.
8. No new dev dependencies; no `pnpm-lock.yaml` regeneration (R9).
9. No changes to `.github/workflows/ci.yml` (R12 surface stays immutable).
10. No changes to `apps/web/**`, `apps/api/**`, `tsconfig.base.json`.
11. No changes to ESLint config, ESLint boundary plugin, ESLint fixtures, or ESLint runner.
12. No new BDD scenario, unit test, or e2e test (R7 forbids; empirical evidence suffices).
13. No `bdd:debug` script (Q2 rejected).
14. No `--bail` flag in CI (Q3 rejected).
15. No ADR 0009 (Q1 rejected; self-documenting config tweak).
16. Nothing from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth beyond Google, production hardening, observability, coverage gate, audit log UI).
17. No migration of `gastos-personales/` to the vertical-slicing model.

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1-R5 with concrete task-level mitigations.)

- **R1 (`tsx/cjs` could differ from `tsx/esm` for top-level await / async module loading)** — Low. Mitigated by T1+T2+T4 verification (18/18 auth + 25/25 transactions scenarios pass with `tsx/cjs`); the BDD scenarios do not use top-level await (verified in slice-7 PR-7 per explore §7 R1). Empirical test on Node 22.14.0 already showed 18/18 PASS in 0.34s.
- **R2 (`tsx/cjs` may not be available in older tsx versions)** — Low. `tsx/cjs` is shipped since tsx 4.16.x (`node_modules/tsx/package.json` `exports` map; explore §4); root `package.json` declares `"tsx": "^4.23.0"` which resolves to `4.23.0` and satisfies `>=4.16.0`.
- **R3 (future tsx major could remove `tsx/cjs`)** — Low. tsx's `exports` map declares both hooks with no deprecation note; if removed, the future fix is the same shape (2-line `package.json` swap to whatever the new hook is called). The 30-LOC `verify.sh` recipe is robust against token-only changes.
- **R4 (the fix could regress local dev on Node 23.x)** — Low. `tsx/cjs` patches Node's CJS `Module._compile` and `Module._extensions['.ts']` regardless of Node major. T4's backward-compat verification (Node 23 + `--no-node-check`) is the empirical gate.
- **R5 (a previous admin-merge workaround assumes old `tsx/esm`)** — Low. Slice-7 PR-8 + slice-8 PR-1 worked around the gate by adding bridging code in `support/register.ts`, not by overriding `tsx` config. R7 + R8 lock the diff to the 2 `package.json` lines + the verify script — the bridging code stays valid because it loads the same way Cucumber always loaded it. The pre-existing bridging PRs (`a9b550d`, `bb25aab`) keep working.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | 32 net LOC (+32 / -2 per design §4 footer: 2 net source swaps + 30 verify script + 1 root wiring line - 1 seed) |
| **400-line budget risk** | Low (32 ≪ 400; 8% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (32 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 32 net LOC well under 400; one PR keeps the loader-hook story coherent (swap 1 → swap 2 → verify recipe → verify marker) |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 5 risks have concrete mitigations already engineered into the 4 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, source design §4) · `risks`: R1-R5 (concrete mitigations baked into the 4 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-bdd-tsx-node22` off `develop@ea7732f` and applies the 4 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-bdd-tsx-node22/proposal.md` (Engram `#2307`)
- **Spec**: `openspec/changes/fix-bdd-tsx-node22/spec.md` (Engram `#2308`; 6 goals, 12 requirements, 6 scenarios, 24 AC)
- **Design**: `openspec/changes/fix-bdd-tsx-node22/design.md` (Engram `#2309`; 4 file diffs, 4 atomic commits, 7 execution steps)
- **Explore brief**: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram `#2306`; empirical RED→GREEN evidence in §5 + §10)
- **Smoking-gun error**: `SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule` (Node 22.13.0 / 22.14.0)
- **Failing CI run (now fixed)**: `29288016689`
- **tsx exports map**: `node_modules/tsx/package.json` `exports` field declares both `tsx/esm` and `tsx/cjs` since 4.16.x
- **Loader chain anatomy**: `@cucumber/cucumber/lib/try_require.js:8` → CJS `require()` → `Module._compile`
- **Empirical test**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s on Node 22.14.0 (explore §5 + §10)
- **Modified files**:
  - `libs/features/auth/server/package.json` (35 LOC → 35 LOC; 1 line swapped)
  - `libs/features/transactions/server/package.json` (33 LOC → 33 LOC; 1 line swapped)
- **New files**:
  - `scripts/bdd/verify.sh` (~30 LOC, executable)
- **Wiring edits**:
  - root `package.json` (+1 LOC: `bdd:verify` script at line 21)
- **Untouched BDD surface** (per explore §6 + spec §6 G6): all 12 `.feature` files (6 auth + 6 transactions), all 5 `.steps.ts` files (3 auth + 2 transactions), both `world.ts` files, both `support/register.ts` files, both `cucumber.mjs` files
- **CI workflow**: `.github/workflows/ci.yml` `BDD (Cucumber)` job — unchanged (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout)
- **Format reference**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (mirrored the 10-section structure; compressed for the smaller change scope — 4 tasks vs 8, no threat matrix, no Spanish mirror, no separate ADR)
- **Project conventions**: AGENTS.md §2 (branch), §4 (strict TDD — config-only, vacuously satisfied), §5 (atomic commits — 4 work-unit commits), §6 (Conventional Commits — `fix`, `feat`, `chore` types), §7 (boundary plugin — none affected), §8 (single source of truth — `bdd` script token lives in exactly one place per slice), §11 (out-of-scope — none touched), §12 (pre-commit checklist), §13 (Spanish mirror — none required, no `.md` added)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**END OF TASKS**.
