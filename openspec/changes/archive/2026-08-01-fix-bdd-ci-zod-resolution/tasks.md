# Tasks — `fix-bdd-ci-zod-resolution` — `gastos-personales-reference`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/fix-bdd-ci-zod-resolution` (off develop)
**Artifact store**: hybrid (openspec files + Engram)
**Mode**: auto (gatekeeper validates between phases)
**Date**: 2026-07-14
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Status**: Planning complete; user will pause before sdd-apply
**PR count**: 1 (5 net LOC of source + lockfile regen + spec.md amend; well under 400-line review budget)

> **CRITICAL — spec↔design reconciliation baked into the task plan**: the spec R2 + AC5 encode the `paths` mapping value as `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (with `../../` prefix). The design's `§8 Q1` proves this value is **technically wrong** — `apps/api/tsconfig.json:10` already sets `"baseUrl": "../.."`, so `paths` values resolve relative to `baseUrl`, and the `../../`-prefixed path lands at `<workspace-parent>/node_modules/.pnpm/...` (one level ABOVE the workspace root). The empirically-correct value is `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (no `../../`). **Apply phase must (a) write the correct path in `tsconfig.json`, (b) amend spec.md R2 + AC5 in the same PR per T4 below, (c) append a one-line note in spec.md's open-questions section explaining the amend.** The 5 tasks below already encode this contract.

> Surgical config-only fix. 2 source files (`apps/api/package.json`, `apps/api/tsconfig.json`) + 1 lockfile auto-regen + 1 spec.md amend + 1 verification marker. The empirical RED→GREEN evidence is recorded in `openspec/changes/fix-bdd-ci-zod-resolution/explore.md` §1, §13 (15× `TS2307: Cannot find module 'zod'` reproduced on `develop` with HOME pollution moved aside; 0 errors after R1+R2 applied). Strict TDD's RED step is satisfied vacuously: no production code is touched, so the BDD runner itself is the regression gate (43/43 scenarios on Node 22; explore §5+§10 of the predecessor `fix-bdd-tsx-node22` established the same empirical-without-test-code precedent for the analogous surgical fix).

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Config-only fix; no test files added.
- **No "Co-Authored-By"** trailers (AGENTS.md §6 + persona hard rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: vacuously satisfied — the failure mode (15× TS2307) is empirically documented in `explore.md` §1, §13; no new failing-test code is required.
- **No Spanish mirror required**: no English `.md` files are added under `openspec/` or `docs/` (AGENTS.md §13; design §7 + spec §7.6). The only `.md` edit this PR makes is the in-spec amend (T4), which edits the existing `spec.md` (no new `.md` file is created).
- **MUST / SHALL / MUST NOT** are RFC 2119; anything weaker (should, may) is non-binding.
- The 5 tasks below map **1:1** to the design's `§4` 3 atomic commits PLUS the T4 spec.md amend (T4 can land in its own commit, or be merged with T2 — both are valid). **No 6th commit. The T5 chore verify marker is a verification gate, not a tracked file change.**

---

## §1. Dependency graph

```
T1 (apps/api/package.json — zod devDep → dep)            independent
T2 (apps/api/tsconfig.json — paths mapping + JSDoc)      independent of T1, can be same commit or separate
T3 (pnpm install — lockfile regen + diff inspect)         depends on T1 (package.json must be staged first so pnpm sees the new state)
T4 (spec.md R2 + AC5 amend — drop ../../ prefix)          independent of T1-T3, can be in any commit
T5 (chore verify marker — full turbo pipeline green)     depends on T1-T4 (records the final green state)
```

**Execution order invariant**: `T1 ║ T2 ║ T4` (parallelizable — three different files, no shared state) → `T3` (depends on T1 because pnpm needs the new package.json state) → `T5`. The orchestrator sequences as `T1 → T2 → T3 → T4 → T5` because:

- T1 lands first to make `apps/api/node_modules/zod` a real symlink after T3's `pnpm install`.
- T2 lands second (or in the same commit as T1) to install the `paths` mapping.
- T3 runs `pnpm install` after T1 is staged (so the lockfile regen sees the new dep section); diff is then inspected.
- T4 amends spec.md independently of T1-T3; orchestrator may merge T4 into T2's commit or split — both are accepted per work-unit-commits skill (the amend is a docs change belonging to the same deliverable as the spec under design §8 Q1).
- T5 is the final state attestation; runs after T1-T4.

---

## §2. Per-task tables (5 tasks)

### T1 — promote `zod` from `apps/api/devDependencies` to `apps/api/dependencies`

| Field | Value |
|-------|-------|
| Commit | `fix(api): apps/api/package.json — move zod from devDep to dep (R1)` |
| Files | `apps/api/package.json` (EDIT, +1 / -1) |
| Depends on | — (independent of T2 / T4; only touches `apps/api/package.json`) |
| LOC | +1 / -1 |
| TDD | n/a (config-only). RED state documented in `explore.md` §1, §13 (15× TS2307 reproduced with HOME pollution moved aside on `develop`). GREEN state observed empirically with R1+R2+R3+R4 (the explorer sub-agent applied Shape A' during reproduction; 0 errors after). |
| Verify | `jq '.dependencies.zod' apps/api/package.json` MUST return `"^4.4.3"` (AC1). `jq '.devDependencies.zod // "missing"' apps/api/package.json` MUST return `"missing"` (AC2). `grep -n '"zod"' apps/api/package.json` MUST show exactly 1 match (in `dependencies`, ~line 32). |

**Concrete edit**: append `,\n    "zod": "^4.4.3"` after line 31 (`"rxjs": "7.8.1"`); delete line 48 from `devDependencies`. No other line in `apps/api/package.json` changes.

---

### T2 — add `zod` `paths` mapping to `apps/api/tsconfig.json` (with 3-line JSDoc)

| Field | Value |
|-------|-------|
| Commit | `fix(api): apps/api/tsconfig.json — add paths mapping for zod orphan schemas (R2, R3)` |
| Files | `apps/api/tsconfig.json` (EDIT, +5 lines inside the `paths` block — 3-line JSDoc + trailing comma on prior last entry + 1 new mapping entry) |
| Depends on | — (independent of T1 / T4; only touches `apps/api/tsconfig.json`) |
| LOC | +5 / -0 |
| TDD | n/a (config-only). Same RED-state rationale as T1; the `paths` mapping closes the 10 orphan-schema errors (the 5 `apps/api/src/` errors are closed by T1 alone). |
| Verify | `jq '.compilerOptions.paths.zod' apps/api/tsconfig.json` MUST return `["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` (AC4 — exactly 1-element array; AC5 — first element equals the **bare** path with **no `../../` prefix**). `grep -n '"zod"' apps/api/tsconfig.json` MUST show exactly 1 match inside the `paths` block. The JSDoc comment MUST occupy 3 consecutive `//` lines directly above the `zod` `paths` entry (AC7). |

> **CRITICAL — path value (design §8 Q1)**: the mapping value MUST be exactly `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (NO `../../` prefix). `apps/api/tsconfig.json:10` already sets `"baseUrl": "../.."`, which makes the workspace root the resolution anchor; the `../../`-prefixed value would resolve to `<workspace-parent>/node_modules/.pnpm/...` (one level ABOVE the workspace root, which does not exist on this machine). Verified empirically by `path.resolve("../..", "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod")` → does not exist; `path.resolve("../..", "node_modules/.pnpm/zod@4.4.3/node_modules/zod")` → exists. The spec R2 + AC5 carry the buggy `../../` value; T4 amends them.

**Concrete edit**: insert after the `"@shared-utils/*"` entry at line 32, the trailing comma on line 32, then 3 `//` JSDoc lines naming the orphan-directory rationale + Node10 walk + pnpm-canonical path, then the new `"zod": ["..."]` entry. No other line in `apps/api/tsconfig.json` changes. The 3-line JSDoc text (verbatim, per proposal §3.2):

```ts
// zod path mapping closes the orphan-schema resolution gap:
// `libs/features/{auth,transactions}/shared/` has no package.json, so
// Node10 ancestor-walk cannot reach zod. This mapping intercepts ALL
// files compiled by apps/api's tsc (including the orphan schemas).
"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
```

(Note: the comment is 4 lines in the source — the design calls it "3-line JSDoc" with the first short sentence + 2 explanatory lines. The verbatim block in `proposal.md` §3.2 has 4 lines; both count as ≥3 per R3/AC7. Apply may condense to 3 lines if preferred, as long as the 3 topic tokens — orphan directory, Node10 ancestor walk, pnpm-canonical path format — are all named.)

---

### T3 — regenerate lockfile + inspect `pnpm-lock.yaml` diff

| Field | Value |
|-------|-------|
| Commit | `chore(api): pnpm install regen — zod moves to apps/api.dependencies (R4)` |
| Files | `pnpm-lock.yaml` (AUTO-REGENERATED by `pnpm install`; NO manual edits) |
| Depends on | T1 (the package.json change MUST be staged first so `pnpm install` sees the new state) |
| LOC | varies (~5-15 lines in the `apps/api` snapshot block) |
| TDD | n/a (verification gate). The lockfile regen is mechanical bookkeeping, not behavioural change. The diff is the *consequence* of T1, not an independent fix. `chore(api):` follows the project convention for lockfile-shuffling commits. |
| Verify | `git diff pnpm-lock.yaml \| head -40` MUST show ONLY changes inside the `apps/api` snapshot block (zod moves from `devDependencies` snapshot location to `dependencies` snapshot location). No other importer section (`apps/web`, `libs/core/config`, `libs/core/events`, `libs/features/{auth,transactions}/server`) MUST change. `git diff develop --stat pnpm-lock.yaml` MUST report non-zero (AC8). Manual review confirms AC9 (snapshot-table reorder is limited to apps/api zod). `pnpm --filter api build` MUST exit 0 (AC14). If `git diff` shows ANY change outside the apps/api zod snapshot reorder, ABORT and investigate per R2 mitigation. |

**Workflow**:

1. `cd apps/api && pnpm install` (NOT `--frozen-lockfile`; that's the signal the lockfile needs regen).
2. `git diff pnpm-lock.yaml | head -40` — inspect. Expect to see the `apps/api` block's zod entry relocate between `specifiers` lines and the `dependencies:` / `devDependencies:` sub-tables.
3. `pnpm --filter api build` — MUST exit 0; 0 TS2307 errors reported.

---

### T4 — amend `openspec/changes/fix-bdd-ci-zod-resolution/spec.md` for the path-bug

| Field | Value |
|-------|-------|
| Commit | (any of: own `docs(spec): correct paths mapping value in R2 + AC5` commit, OR fold into T2's commit — orchestrator chooses) |
| Files | `openspec/changes/fix-bdd-ci-zod-resolution/spec.md` (EDIT, 3 line changes: R2 path string, AC5 pass-condition, 1 note in §11) |
| Depends on | — (independent of T1-T3; different file path; only touches `spec.md`) |
| LOC | ~3 lines net (R2 path value drops `../../`, AC5 drops `../../`, §11 grows by 1 note) |
| TDD | n/a (docs amend). The spec encodes the **wrong** path value `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` in R2 + AC5. The apply phase writes the **correct** path value per design `§8 Q1`. The spec must catch up; otherwise `sdd-verify` would mark AC5 FAIL on the technically-correct path while spec still mandates the unreachable one. The amend is part of the same PR (work-unit-commits: docs of a fix belong with the fix). |
| Verify | `grep -n '../../node_modules/.pnpm/zod' openspec/changes/fix-bdd-ci-zod-resolution/spec.md` MUST return 0 matches after amend (AC5 amended). `grep -n 'node_modules/.pnpm/zod@4.4.3/node_modules/zod' openspec/changes/fix-bdd-ci-zod-resolution/spec.md` MUST return ≥2 matches (R2 + AC5 updated). `git diff develop -- openspec/changes/fix-bdd-ci-zod-resolution/spec.md` MUST show only the R2 + AC5 + §11-note hunks; no other spec section modified. |

**Three edits** (per design `§8 Q1`):

1. **R2 path value** (around line 102 in spec.md): change `"zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` to `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`. Drop the `../../` prefix.
2. **AC5 pass-condition** (line 310 in spec.md): change `first element equals "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` to `first element equals "node_modules/.pnpm/zod@4.4.3/node_modules/zod"`. Drop the `../../` prefix.
3. **§11 open-questions note** (after Q5 in spec.md): append a new sub-clause:

   > ### Design §8 Q1 — spec↔design reconciliation (amended at apply time)
   >
   > **Amendment (2026-07-14, apply phase)**: the `paths` mapping value in R2 and AC5 above was corrected from `"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` to `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (drop `../../`). Root cause: `apps/api/tsconfig.json:10` already sets `"baseUrl": "../.."`, so `paths` entries resolve relative to `baseUrl` (workspace root), not the tsconfig file. The `../../`-prefixed value resolved to `<workspace-parent>/node_modules/.pnpm/...` (one level ABOVE the workspace root) and does not exist on this filesystem. Verified empirically via `path.resolve("../..", "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod")` → `false` vs `path.resolve("../..", "node_modules/.pnpm/zod@4.4.3/node_modules/zod")` → `true`. The fix in `apps/api/tsconfig.json` uses the correct path; this spec is amended to match. See design.md §8 Q1 for the full rationale.

(Optional 4th edit: G1.1 Gherkin scenario line 162 of spec.md carries the same `../../` prefix in the GIVEN clause. Apply MUST amend this line too — the bare path makes the scenario match the actual filesystem; the `../../` form would not. This 4th edit is folded into T4 for completeness.)

---

### T5 — verification marker (full turbo pipeline green on Node 22)

| Field | Value |
|-------|-------|
| Commit | (chore verify marker — orchestration choice: may be combined with the last substantive commit's body, or land as its own empty commit `chore(api): verify turbo pipeline green on Node 22 (R5 marker)`) |
| Files | (no file changes — empty verification marker) |
| Depends on | T1 + T2 + T3 + T4 (must observe the cumulative state after all 4 prior tasks) |
| LOC | 0 / 0 |
| TDD | n/a (gate marker). Records the binary accept criteria: `pnpm turbo run test bdd lint typecheck build` exits 0 with 43/43 BDD scenarios (18 auth + 25 transactions). Body MUST cite the explore brief §1, §13 as the empirical RED→GREEN evidence (per spec §7.2 + design §3 step 9). No `Co-Authored-By` (AC27). Conventional Commit subject format (AC29). |
| Verify | `pnpm turbo run test bdd lint typecheck build` MUST exit 0 across the workspace. `pnpm --filter api build` MUST exit 0 (AC14). `pnpm --filter web build` MUST exit 0 (AC15 — zod 3.24.1 preserved). `pnpm turbo run bdd` MUST exit 0 with stdout reporting `43 scenarios` (`18 scenarios (18 passed)` for auth + `25 scenarios (25 passed)` for transactions; AC16 + AC17 + AC18 + AC19). `pnpm lint:fixtures` MUST exit 0 with the same fixture pass count as on `develop` (±0; AC23). `git log feat/fix-bdd-ci-zod-resolution --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (AC27). `git log --oneline develop..feat/fix-bdd-ci-zod-resolution` MUST show the expected commit count (3 commits OR 4 commits if T4 lands separately, OR 5 commits if T5 lands separately — orchestrator decides; AC28 is RELAXED in this tasks because the design §4 specifies 3 + the spec.md amend counts as a 4th potential commit). |

---

## §3. PR plan (single PR)

**PR title**: `fix(api): close BDD CI gate — move zod to dep + tsconfig paths for orphan schemas`

**Branch**: `feat/fix-bdd-ci-zod-resolution` (cut from `develop` at HEAD `c80c3a4`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2)

**Merge strategy**: squash-merge at PR end. The 4-5 commit story lives in the PR description; the squash collapses to a single revertible change on `develop`.

**Pre-PR checklist**:

- [ ] All 4-5 commits land in order on `feat/fix-bdd-ci-zod-resolution` (T1 → T2 → T3 → T4 [optional merge into T2] → T5).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AC27).
- [ ] **CRITICAL**: the `apps/api/tsconfig.json` `paths` entry uses `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` with NO `../../` prefix (design §8 Q1).
- [ ] **CRITICAL**: the spec.md amend (T4) lands in this same PR (same commit as T2 or as its own commit). No `../../` prefix anywhere in spec.md R2 or AC5 or G1.1 Gherkin.
- [ ] `pnpm --filter api build` exits 0 in clean container (AC14).
- [ ] `pnpm turbo run bdd` exits 0 with 43/43 scenarios (AC16-AC19).
- [ ] `pnpm --filter web build` exits 0 (AC15 — zod 3.24.1 preserved).
- [ ] `pnpm lint:fixtures` exits 0 (AC23 — no boundary violations).
- [ ] `pnpm turbo run test lint typecheck build` exits 0 across all workspaces.
- [ ] The diff does NOT include any `.ts` source file (only `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml`, `openspec/changes/fix-bdd-ci-zod-resolution/spec.md`).
- [ ] GitHub Actions BDD (Cucumber) job reports `success` on the PR.
- [ ] `git diff develop --stat` reports ≈ +5 / -1 net LOC source + ~10 lines lockfile regen + ~3 lines spec.md amend (well under 400-line review budget).
- [ ] PR body references: (1) the previous PR #63 bypass (`fix-bdd-tsx-node22` admin-merged with BDD gate bypassed because of this latent zod bug), (2) the explore empirical reproducer (`explore.md` §1, §13 — 15 TS2307 errors with HOME pollution moved aside, 0 errors after Shape A' patch), (3) the design §8 Q1 spec↔design reconciliation (the `../../` path bug and the bare-path correction), (4) the 4-5 commit list mapping 1:1 to T1-T5.

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` — auto-slices on >400 LOC.
- **This change's effective strategy**: **single PR**. ~5 net source LOC + ~10 lockfile + ~3 spec.md amend sits at ~5% of the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended**.
- **Branch**: `feat/fix-bdd-ci-zod-resolution` cut from `develop` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa).
- **Risk profile**: 7 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1-R6 + design §8 Q1 path-bug risk); all have concrete mitigations already engineered into the 5 tasks (empirical RED→GREEN evidence in `explore.md` §1, §13; the spec.md amend prevents `sdd-verify` from blocking on the wrong path; the design §8 Q1 mem_save observation prevents future design phases from re-deriving the bug).

---

## §5. Apply order

1. **Create branch** `feat/fix-bdd-ci-zod-resolution` off `develop@c80c3a4`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-bdd-ci-zod-resolution
   ```
2. **Apply T1** (commit `fix(api): apps/api/package.json — move zod from devDep to dep (R1)`):
   - Edit `apps/api/package.json`: delete line 48 (`"zod": "^4.4.3"` in `devDependencies`); insert `,\n    "zod": "^4.4.3"` after line 31 (closing comma on `rxjs` line, then new zod entry). Result: zod in `dependencies`, absent from `devDependencies`. Other lines byte-identical.
   - Run `jq '.dependencies.zod' apps/api/package.json` — should return `"^4.4.3"`. Run `jq '.devDependencies.zod // "missing"' apps/api/package.json` — should return `"missing"`.
3. **Apply T2** (commit `fix(api): apps/api/tsconfig.json — add paths mapping for zod orphan schemas (R2, R3)`):
   - Edit `apps/api/tsconfig.json` `compilerOptions.paths` block: after line 32 (`"@shared-utils/*": ["../libs/shared-utils/*"]`), append `,` then 3 `//` JSDoc lines (verbatim from proposal §3.2) then `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`.
   - Run `jq '.compilerOptions.paths.zod' apps/api/tsconfig.json` — should return `["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` (1-element array, **no** `../../` prefix).
4. **Apply T3** (commit `chore(api): pnpm install regen — zod moves to apps/api.dependencies (R4)`):
   - Run `cd apps/api && pnpm install` (NOT `--frozen-lockfile`; that exits 1 — that's the signal).
   - Run `git diff pnpm-lock.yaml | head -40` — verify ONLY the apps/api zod snapshot location changed.
   - Run `pnpm --filter api build` — must exit 0; 0 TS2307 errors.
5. **Apply T4** — orchestrator choice (commit `docs(spec): spec.md R2 + AC5 amend — drop ../../ prefix in paths value`, OR merge into T2's commit):
   - Edit `openspec/changes/fix-bdd-ci-zod-resolution/spec.md`: (a) drop `../../` from the R2 example value, (b) drop `../../` from the AC5 pass-condition, (c) append a sub-clause to §11 Q1 (or new §11 sub-section) explaining the amend, (d) drop `../../` from the G1.1 Gherkin GIVEN clause.
   - Run `grep -n '../../node_modules/.pnpm/zod' openspec/changes/fix-bdd-ci-zod-resolution/spec.md` — should return 0 matches.
   - Run `grep -n 'node_modules/.pnpm/zod@4.4.3/node_modules/zod' openspec/changes/fix-bdd-ci-zod-resolution/spec.md` — should return ≥2 matches (R2 + AC5).
6. **Apply T5** (optional — orchestrator may fold into T3's commit body):
   - Run the full verification pipeline (see T5 verify commands).
   - If standing as separate commit, body MUST cite `explore.md §1, §13` as empirical RED→GREEN evidence.
7. **Pre-commit hygiene gates** (per AGENTS.md §12):
   ```bash
   pnpm lint:fixtures              # MUST exit 0; no ESLint changes
   pnpm typecheck                  # MUST exit 0; no .ts changes
   pnpm turbo run test             # MUST exit 0 across workspaces
   ```
8. **Push the branch**:
   ```bash
   git push -u origin feat/fix-bdd-ci-zod-resolution
   ```
9. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-bdd-ci-zod-resolution \
     --title "fix(api): close BDD CI gate — move zod to dep + tsconfig paths for orphan schemas" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   PR body MUST lead with: (a) the one-line statement that this restores the previously-broken BDD CI gate on `develop` (PR #63 was admin-merged with this gate bypassed because of this latent zod bug), (b) the empirical reproducer recipe from explore §13 (move HOME pollution aside → clean install → reproduce 15 TS2307 errors → apply Shape A' → 0 errors), (c) the design §8 Q1 spec↔design reconciliation explaining why the spec.md amend was needed in the same PR.
10. **Wait for CI**. The BDD (Cucumber) job MUST go from `FAIL` (the pre-fix state that was bypassed in PR #63) to `PASS` on this PR. Other CI jobs (`build`, `lint`, `typecheck`, `test`, `e2e`) MUST also pass.
11. **Review + squash-merge**:
    ```bash
    gh pr merge --squash feat/fix-bdd-ci-zod-resolution   # after maintainer approval
    ```
12. **`sdd-verify` runs on `develop` post-merge** to confirm the gate stays green (43/43 BDD scenarios, `pnpm --filter api build` exits 0). `sdd-verify` MUST accept the corrected AC5 path value (no `../../`).
13. **`sdd-archive` moves** `openspec/changes/fix-bdd-ci-zod-resolution/{explore,proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-14-fix-bdd-ci-zod-resolution/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

(All 5 deferred from proposal §10 + 1 added by the design phase were resolved in `spec.md` §11 + design `§8 Q1`.)

- **Q1 (ADR 0010)**: **NO ADR.** The change is 3-LOC of tsconfig `paths` + 1-LOC `package.json` move + lockfile regen; an ADR for a config tweak of this size is bureaucratic overhead. The 3-line JSDoc comment in `apps/api/tsconfig.json` (R3) is a better fit. The `fix-bdd-tsx-node22` precedent (also 2-file config fix) also skipped the ADR.
- **Q2 (JSDoc comment in tsconfig.json)**: **YES** — R3 mandates a 3+ line JSDoc-style comment above the `zod` `paths` entry. Verbatim text in proposal §3.2.
- **Q3 (CI smoke test for HOME pollution)**: **NO.** CI's GitHub Actions runner is already a clean Linux container (per explore §7); the reproducer recipe in R12 is sufficient for future regression detection.
- **Q4 (`openspec/specs/` capability creation)**: **NO.** This is a build-config mechanics fix; no behavioural contract changes. No new capability file.
- **Q5 (follow-up slice for orphan-directory cleanup)**: **YES — deferred** to a separate `fix-orphan-shared-directories` change. The JSDoc comment (Q2) + R13 PR description ("Known follow-up" section) + spec §11 Q5 entry are the breadcrumbs until then.
- **Design §8 Q1 (added by design phase) — spec↔design path reconciliation**: **RESOLVED at apply time** (T4). The spec.md R2 + AC5 carry the wrong path value (`"../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"` with `../../` prefix). Empirical verification proves this path is unreachable: when `baseUrl` is set, `paths` entries resolve relative to `baseUrl`; `apps/api/tsconfig.json:10` sets `"baseUrl": "../.."` (workspace root); the `../../`-prefixed value therefore resolves to `<workspace-parent>/node_modules/.pnpm/...` (one level ABOVE the workspace root) and does not exist. The correct path is `"node_modules/.pnpm/zod@4.4.3/node_modules/zod"` (no `../../`). Apply MUST (a) write the correct path in `apps/api/tsconfig.json` (T2), (b) amend spec.md R2 + AC5 (and the G1.1 Gherkin GIVEN clause) in the same PR (T4), (c) append a one-line note in spec.md §11 explaining the amend. Without the amend, `sdd-verify` would mark AC5 FAIL on the technically-correct path while spec still mandates the unreachable one.

**No open questions remain at the apply phase. The apply phase proceeds directly with the 5 tasks above.**

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §4 + §10 + `proposal.md` §2.2 + AGENTS.md §11.)

1. No new features.
2. No zod version pin or upgrade; `^4.4.3` is preserved byte-identical.
3. No Node version change; Node 22.13.0 stays the CI target.
4. No changes to any `.ts` source file — schema files, app files, support code, step-defs, world types, cucumber configs.
5. No changes to any `.feature` file (the 9 Gherkin files across both slices).
6. No changes to `apps/web/**` (zod 3.24.1 + `@hookform/resolvers/zod@3.10` bridge stays intact).
7. No changes to `libs/features/{auth,transactions}/server/package.json` (these have pre-existing duplicate zod declarations — a separate latent issue, deferred).
8. No changes to `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/api/nest-cli.json`, `.github/workflows/ci.yml`.
9. No new dev dependencies; no `pnpm` version bump; no new package.
10. No new scripts (`bdd:debug`, `--bail`, etc.).
11. No new ESLint rule, boundary-plugin edit, or `lint:fixtures` fixture.
12. No new test (unit, BDD, or e2e). Strict TDD's RED step is satisfied empirically by the explore brief (no production code touched; explore §1, §13).
13. No `ADR 0010` (Q1 rejected; the JSDoc comment is a better fit for the size).
14. No CI smoke test (`HOME=$(mktemp -d)`) — Q3 rejected.
15. No `openspec/specs/apps-api-build-resolution/spec.md` — Q4 rejected (no capability change).
16. No `Documents-es/` mirror (no English `.md` added under `openspec/` or `docs/`; AGENTS.md §13).
17. No new `fix-orphan-shared-directories` change here — Q5 deferred to a follow-up slice.
18. Nothing from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth beyond Google, production hardening, observability, coverage gate, audit log UI).
19. No migration of `gastos-personales/` to the vertical-slicing model.
20. No changes from the predecessor `fix-bdd-tsx-node22` (loader hook token — closed and unrelated).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1-R6 + the **new R7 spec.md amend risk** added in this tasks phase.)

| ID | Risk | Likelihood | Concrete mitigation in this tasks plan |
|----|------|------------|---------------------------------------|
| **R1** | Hard-coded zod version (`4.4.3`) in the `paths` mapping creates a maintenance burden — bumping zod requires editing BOTH `apps/api/package.json` AND `apps/api/tsconfig.json`. | Low | (a) T2 mandates a 3-line JSDoc comment directly above the `zod` `paths` entry that flags the hard-coded version and names the pnpm-canonical path format. (b) A future slice-8 maintenance task can sweep the path when zod bumps. (c) Alternative postinstall-script approach is explicitly out of scope per proposal §10 Q1. |
| **R2** | The lockfile regen (`pnpm install`) may surface unexpected drift if other deps were out of date before the fix. | Low | T3 inspects `git diff pnpm-lock.yaml` BEFORE commit. Only the apps/api zod snapshot relocation MUST change. Any other diff aborts the apply (R2 mitigation). |
| **R3** | `apps/web`'s zod 3.24.1 may conflict with `apps/api`'s zod 4.4.3 if pnpm hoists incorrectly. | Low | T1 dep move is in `apps/api/package.json` ONLY. `apps/web/package.json` is untouched. pnpm's dual-version contract (zod 3 for web, zod 4 for api) is preserved. T2 `paths` mapping is TS-only and does not affect Node runtime resolution. |
| **R4** | The orphan `libs/features/*/shared/` directory is a code smell that this fix papers over. Future contributors adding new `shared/` packages will hit the same gap. | Med | T2 JSDoc comment names the root cause explicitly: "`libs/features/{auth,transactions}/shared/` has no `package.json`". The follow-up `fix-orphan-shared-directories` change (per spec §11 Q5 resolution) is the long-term fix; until then, the JSDoc is the breadcrumb. |
| **R5** | A future pnpm major could change the `.pnpm/zod@<version>/node_modules/zod` canonical path format (e.g. switch to content-addressable storage with hashes). | Low | pnpm's `node_modules/.pnpm/<name>@<version>/node_modules/<name>` layout has been stable since pnpm 6 and unchanged in 11.x. A path-format change would require a project-wide tsconfig sweep (not just this one mapping) — equivalent maintenance burden to any other `paths` consumer in the project. The T2 JSDoc comment also flags the path format. |
| **R6** | Duplicate zod declarations in `libs/features/{auth,transactions}/server/package.json` may confuse reviewers into thinking this fix touched those files. | Low | Document in the PR description that those duplicates are pre-existing (explore §8) and are NOT touched by this change. AC13 (`git diff develop --name-only -- libs/features/{auth,transactions}/server/package.json` returns empty) is the formal proof. A follow-up lint rule (`no-duplicate-dep-declaration`) could catch this — out of scope per spec §10 #6. |
| **R7 (new in this tasks phase)** | The spec.md path-bug amend (T4) may be lost in squash-merge or reviewers may not notice it. | Low | (a) T4 lands in this same PR (either as its own commit or folded into T2's commit) — the work-unit-commit principle says docs of a fix belong with the fix. (b) The squash at PR end preserves the file changes (the squash collapses commit history, not file content). (c) The PR body's "Design §8 Q1 spec↔design reconciliation" section explicitly flags the amend for reviewers. (d) The §11 note in spec.md is permanent breadcrumb for future readers. |

**Per-file rollback analysis** (from design §6 R6, restated):

- **Revert T1 only** (`apps/api/package.json`): zod returns to `devDependencies`. The 5 `apps/api/src/` TS2307 errors return; the 10 orphan-schema errors stay CLOSED via the T2 `paths` mapping. BDD gate fails with the 5 errors. NOT acceptable as a half-fix, but the orphan-schema half-fix is still partial value.
- **Revert T2 only** (`apps/api/tsconfig.json`): the `paths` mapping + comment are removed. The 5 `apps/api/src/` errors stay CLOSED (T1 devDep move still works); the 10 orphan-schema errors return. BDD gate fails. NOT acceptable as a half-fix for the same reason.
- **Revert T3 only** (`pnpm-lock.yaml`): the lockfile reverts to its pre-fix content-hash (zod in apps/api devDep snapshot). `pnpm install` will reconcile the lockfile against the current `package.json` (zod in deps) on the next run, so a manual rollback of just the lockfile is unstable. NOT recommended. Roll back T1 + T3 together if needed.
- **Revert T4 only** (spec.md amend): the spec returns to the buggy `../../` value. `sdd-verify` would then mark AC5 FAIL on the technically-correct path. NOT a regression to runtime behaviour — purely a docs regression. Re-running the amend (or folding into a future re-archive) is trivial.
- **Revert T1+T2+T3+T4 together**: full revert; `apps/api#build` fails on 15 TS2307 errors (the same state as `develop` pre-fix). Acceptable as a clean rollback target.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | +5 / -1 net source LOC + ~5-10 lines lockfile regen + ~3 lines spec.md amend = ~13 net LOC |
| **400-line budget risk** | Low (~3% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (13 ≪ 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 13 net LOC well under 400; one PR keeps the orphan-schema fix + spec reconciliation coherent (config fix → spec.md amend → lockfile regen → verify marker) |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 7 risks have concrete mitigations already engineered into the 5 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, source design §4 + design §8 Q1) · `risks`: R1-R7 (concrete mitigations baked into the 5 tasks above; R7 is the new spec.md-amend risk introduced in this tasks phase)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-bdd-ci-zod-resolution` off `develop@c80c3a4` and applies the 5 tasks in §2 sequentially (or folds T4 into T2 per work-unit-commits principle, keeping the file-level diff intact).

---

## Cross-references

- **Proposal**: `openspec/changes/fix-bdd-ci-zod-resolution/proposal.md` (Engram `#2329`)
- **Spec**: `openspec/changes/fix-bdd-ci-zod-resolution/spec.md` (Engram `#2331`; 6 goals, 13 requirements, 6 Gherkin scenarios, 30 AC; **contains the spec↔design path-bug at R2 + AC5 + G1.1 Gherkin — fixed at apply time per T4**)
- **Design**: `openspec/changes/fix-bdd-ci-zod-resolution/design.md` (Engram `#2332`; 3 source files in scope, 3 atomic commits, 7 execution steps, **§8 Q1 documents the path-bug + the spec.md amend prescription**)
- **Explore brief**: `openspec/changes/fix-bdd-ci-zod-resolution/explore.md` (Engram `#2328`; empirical RED→GREEN evidence in §1, §13 — 15× TS2307 reproduced on `develop` with HOME pollution moved aside)
- **Bugfix observation**: Engram `#2333` (documents the design §8 Q1 path-bug — `paths` values resolve relative to `baseUrl`, not the tsconfig file, when `baseUrl` is set)
- **Smoking-gun error**: 15× `error TS2307: Cannot find module 'zod' or its corresponding type declarations.` (5 in `apps/api/src/`, 10 in `libs/features/*/shared/schemas/*.ts`)
- **Empirical path-bug verification** (from design §8 Q1):
  ```js
  path.resolve("../.." /* baseUrl */, "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod")
  // → /Users/.../Proyectos/2026/node_modules/.pnpm/zod@4.4.3/node_modules/zod
  // → exists: false  (BUG — one level above workspace root)
  path.resolve("../.." /* baseUrl */, "node_modules/.pnpm/zod@4.4.3/node_modules/zod")
  // → /Users/.../Proyectos/2026/on-line/gastos-personales-reference/node_modules/.pnpm/zod@4.4.3/node_modules/zod
  // → exists: true   (CORRECT — workspace root + pnpm-canonical path)
  ```
- **BDD gate history**: PR #63 (`fix-bdd-tsx-node22`) admin-merged with BDD gate bypassed because of this latent zod bug. This fix closes the gate permanently.
- **Loading-config references** (verified at design time):
  - `apps/api/tsconfig.json:5` — `moduleResolution: "node"` (Node10 classic, strict ancestor walk)
  - `apps/api/tsconfig.json:10` — `baseUrl: "../.."` (workspace root; **this is what makes the T2 `paths` value WORK without a `../../` prefix — see design §8 Q1**)
  - `apps/api/tsconfig.json:19-33` — `compilerOptions.paths` block (where the T2 zod entry lands as the last element)
  - `apps/api/tsconfig.json:35-40` — `include` glob covers BOTH `apps/api/src/**` AND `../libs/features/{auth,transactions}/shared/schemas/**` (source of orphan-schema resolution failure)
  - `apps/api/package.json:48` — pre-fix zod devDep declaration (moves to `dependencies` via T1)
- **Lockfile state** (at design time):
  - `node_modules/.pnpm/zod@4.4.3/node_modules/zod` exists (apps/api + slice servers + libs/core deps) — **this is the path T2 maps to**
  - `node_modules/.pnpm/zod@3.24.1/node_modules/zod` exists (apps/web pin — untouched)
  - `node_modules/zod` does NOT exist at workspace root (pnpm does not hoist by default)
- **Schema files** (untouched by R5): all 10 in `libs/features/{auth,transactions}/shared/schemas/*.ts` (5 auth + 5 transactions — login, register, forgot-password, reset-password, session-list; create, update, list, category-create, category-update)
- **`apps/api/src` zod consumers** (untouched by R5): `auth.controller.ts:78, :81`; `body.decorator.ts:2`; `query.decorator.ts:2`; `zod-validation.pipe.ts:3`
- **Slice server `package.json` files** (untouched by R7): `libs/features/{auth,transactions}/server/package.json` (each has a pre-existing duplicate zod declaration in `dependencies` and `devDependencies` — explore §8, deferred per spec §10 #6)
- **CI workflow**: `.github/workflows/ci.yml` `BDD (Cucumber)` job uses Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout — UNCHANGED (no `.yml` edit)
- **Modified files** (apply produces these 4 files in the PR diff):
  - `apps/api/package.json` (50 LOC → 50 LOC; 1 line moved: line 48 in `devDependencies` → inserted after line 31 in `dependencies`)
  - `apps/api/tsconfig.json` (42 LOC → 47 LOC; +5 lines inside `paths` block: trailing comma on line 32 + 3 JSDoc lines + 1 new mapping entry)
  - `pnpm-lock.yaml` (~5-15 LOC diff inside the apps/api snapshot block)
  - `openspec/changes/fix-bdd-ci-zod-resolution/spec.md` (~3 lines diff: R2 + AC5 + G1.1 Gherkin path strings drop `../../`; §11 grows by 1 note)
- **Format reference**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/tasks.md` (mirrored the 10-section structure + per-task table style + dependency graph + applied-task invocation order; compressed for the smaller change scope — 5 tasks vs 4 because of the spec.amend task + the explicit verification marker)
- **Project conventions**: AGENTS.md §2 (branch — develop → tracker `feat/fix-bdd-ci-zod-resolution`), §3 (quality gates — all six must pass; covered by T5 verification), §4 (strict TDD — config-only, vacuously satisfied by explore §1, §13), §5 (atomic commits — 3-5 work-unit commits; per-file rollback clean), §6 (Conventional Commits — `fix(api):`, `chore(api):`, `docs(spec):` types; no AI attribution), §7 (boundary plugin — no rule, fixture, config, or runner edits), §8 (single source of truth — zod dep declared in exactly one place per package; `paths` mapping in exactly one place per tsconfig), §11 (out-of-scope list — none of its items touched), §12 (pre-commit checklist — single-purpose commits, rollback-trivial, ESLint unchanged), §13 (Spanish mirror — none required; spec.md is an in-place amend, not a new `.md` file)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain` (NOT triggered, 13 ≪ 400), `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**END OF TASKS**.
