# Tasks — `fix-vitest-4-deprecation` — `gastos-personales-reference`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/fix-vitest-4-deprecation` (off develop)
**Artifact store**: hybrid (openspec files + Engram)
**Mode**: auto (gatekeeper validates between phases)
**Date**: 2026-07-14
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Status**: Planning complete; user will pause before sdd-apply
**PR count**: 1 (~5 net LOC; well under 400-line review budget)

> One-file test-config shape migration (`apps/web/vitest.config.ts`). Vitest 4 removed `poolOptions`; the official replacement for the slice-7 PR-7 `singleFork: true` workaround is the top-level `pool: "forks"` + `maxWorkers: 1` + `isolate: false` triple. Strict TDD's RED step is satisfied vacuously per AGENTS.md §4 (pure config files do not require tests but MUST keep the pipeline green): RED is the current `DEPRECATED test.poolOptions was removed in Vitest 4...` warning on stderr; GREEN is the post-edit clean stderr + 145/145 + 22/22 + 43/43 + 25/25 baseline preserved. Vitest pinned at `4.1.9` (R11); single-source-of-truth config (R7) — only `apps/web/vitest.config.ts` uses the deprecated pattern (verified by repo-wide grep).

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Tests land in the same commit as the behavior they verify. The change folder specs (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) are coordination artifacts, not user-facing docs — no Spanish mirror required (orchestrator instruction + `fix-bdd-tsx-node22` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-web-vitest-crash` precedents).
- **No "Co-Authored-By"** trailers (AGENTS.md §6 + persona hard rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN** (AGENTS.md §4): vacuously satisfied per the exception for pure config files. The RED state is empirically documented in `openspec/changes/fix-coverage-minor-subfailures/explore.md` (Engram `#2394`) and current-trust observation Engram `#2380`.
- **`MUST / SHALL / MUST NOT`** are RFC 2119; anything weaker (should, may) is non-binding.
- The 2 tasks below map **1:1** to the 2 atomic commits in `design.md` §4. **No 3rd commit. No merging of the two.**

---

## §1. Dependency graph

```
T1 (apps/web/vitest.config.ts migration) — independent
    │
    ▼
T2 (chore verify marker) — depends on T1
```

**Execution order invariant**: `T1 → T2`. T2's verification MUST observe the cumulative state after T1; it captures the binary R8 + R9 + R10 + R13 gates and the slice-7 PR-7 single-fork semantics check.

---

## §2. Per-task tables (2 tasks)

### T1 — migrate `apps/web/vitest.config.ts` to the Vitest 4 top-level shape

| Field | Value |
|-------|-------|
| Commit | `fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)` |
| Files | `apps/web/vitest.config.ts` (EDIT, L40-63, net +2 / −12 / +14 raw) |
| Depends on | — (independent; first task on the branch) |
| LOC | +2 net (+14 / −12 raw) |
| TDD | n/a per AGENTS.md §4 (pure config). RED = current `pnpm --filter web test` stderr: `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.` GREEN = post-edit clean stderr + 145/145 + 25/25 + 22/22 + 43/43 baseline preserved. |
| Edit | **(A)** Drop the 3-line `@ts-expect-error` block at L55-58 (no upstream type error remains). **(B)** Drop the 5-line `poolOptions: { forks: { singleFork: true } }` block at L59-63. **(C)** Add `maxWorkers: 1` + `isolate: false` immediately after the existing `pool: "forks"` at L54. **(D)** Refresh the JSDoc paragraph at L40-53 to (i) cite slice-7 PR-7 commit `36386e1`, (ii) include the `DO NOT drop maxWorkers: 1 or set isolate: true without re-reading slice 7` warning, (iii) link to the Vitest 4 migration guide (`https://vitest.dev/guide/migration#pool-rework`). The rest of the file (plugins, `include`, `environment`, `globals`, `clearMocks`, `setupFiles`, `testTimeout`, `hookTimeout`, all 9 `resolve.alias` entries) is UNTOUCHED. Spec R1-R6 + R12 + R13 enforced. |
| Verify | **(G1)** `grep -nE '^\s+pool:\s+"forks"' apps/web/vitest.config.ts` returns 1 hit (AC1, R1). **(G2)** `grep -nE '^\s+maxWorkers:\s+1\b' apps/web/vitest.config.ts` returns 1 hit (AC2, R2). **(G3)** `grep -nE '^\s+isolate:\s+false\b' apps/web/vitest.config.ts` returns 1 hit (AC3, R3). **(G4)** `grep -c 'poolOptions' apps/web/vitest.config.ts` returns 0 (AC4, R4). **(G5)** `grep -c '@ts-expect-error' apps/web/vitest.config.ts` returns 0 (AC5, R5). **(G6)** `grep -nE 'slice 7 PR-7\|vitest\.dev/guide/migration' apps/web/vitest.config.ts` returns ≥2 hits (AC6, R6). **(G7)** `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (AC7, R9). **(G8)** `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` exits 1 (empty output) (AC8, R8). **(G9)** `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25 PASS / 0 FAIL (AC9, R9 + R13). **(G10)** `pnpm turbo run lint typecheck` exits 0 (R10). **(G11)** `git diff --name-only origin/develop..HEAD \| grep -E 'vitest\.config.*$'` returns exactly 1 line: `apps/web/vitest.config.ts` (R7, AC10). **(G12)** `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` is empty (R11, AC11). |

---

### T2 — verification marker (vitest green + no deprecation + slice-7 semantics preserved)

| Field | Value |
|-------|-------|
| Commit | `chore(test): verify pnpm --filter web test exits 0 + 145/145 + 22/22 + 43/43 + 25/25 (R6 marker)` |
| Files | (no file changes — empty verification marker commit) |
| Depends on | T1 |
| LOC | 0 / 0 |
| TDD | n/a (gate marker). Captures the binary R8 + R9 + R10 + R13 acceptance in the commit body so a reviewer can verify each gate independently from the GREEN-causing change in T1. Body MUST cite the spec requirement IDs (`R8`, `R9`, `R10`, `R13`) and the design §3 steps 3-7. The orchestrator MAY elide this commit at apply time if the same verification runs in CI and reports the same facts; the design keeps it as an option per AGENTS.md §5 (atomic-commit hygiene — verification observations live on the commit that observed them, not on the commit that caused them). |
| Verify | **(VM1)** `pnpm --filter api test` exits 0 with 22 PASS (R9, AC12). **(VM2)** `pnpm turbo run bdd` exits 0 with 43 scenarios (R9, AC13). **(VM3)** `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (re-confirms T1's G7 from a clean shell). **(VM4)** `pnpm --filter web test 2>&1 \| grep -i "deprecated.*poolOptions"` returns empty (re-confirms T1's G8). **(VM5)** `git log feat/fix-vitest-4-deprecation --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty (AC17). **(VM6)** `git log feat/fix-vitest-4-deprecation --pretty=format:"%s"` shows exactly 2 commits, each subject matches `^(fix\|chore)(\(.+\))?: .+` and is ≤72 chars (AC18). **(VM7)** `git log --oneline \| grep 36386e1` returns 1 hit (slice-7 PR-7 workaround commit preserved, NOT amended or rebased) (AC16). |

---

## §3. PR plan (single PR)

**PR title**: `fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)`

**Branch**: `feat/fix-vitest-4-deprecation` (cut from `develop` at HEAD `b0f5d24`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2)

**Merge strategy**: squash-merge at PR end. The 2-commit story lives in the PR description; the squash collapses to a single revertible change on `develop`. Per `design.md` §9 AC20: `git log origin/develop..HEAD --merges` ≤1.

**Pre-PR checklist**:

- [ ] All 2 commits land in order on `feat/fix-vitest-4-deprecation` (T1 → T2).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period (AC18).
- [ ] No `Co-Authored-By` trailers in any commit (AC17).
- [ ] No commit amends or rebases the slice-7 PR-7 commit `36386e1` (AC16).
- [ ] No commit touches any other `vitest.config.*` file (only `apps/web/vitest.config.ts` — R7, AC10).
- [ ] `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (R9, AC7).
- [ ] `pnpm --filter web test 2>&1 | grep -F 'DEPRECATED test.poolOptions'` exits 1 (empty output — R8, AC8).
- [ ] `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25 PASS / 0 FAIL (slice-7 PR-7 repro preserved — R13, AC9).
- [ ] `pnpm --filter api test` exits 0 with 22/22 PASS (R9, AC12).
- [ ] `pnpm turbo run bdd` exits 0 with 43/43 scenarios (R9, AC13).
- [ ] `pnpm turbo run lint typecheck` exits 0 (R10, AC14).
- [ ] `pnpm lint:fixtures` exits 0 (boundary plugin still silent on the new file content — AC15).
- [ ] `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json | grep -E '"vitest"\s*:'` returns empty (vitest stays at 4.1.9 — R11, AC11).
- [ ] `git diff --stat develop..feat/fix-vitest-4-deprecation` reports ~+16 / −12 ~ +5 net LOC (well under 400-line review budget).
- [ ] PR description cites the Vitest 4 migration guide URL `https://vitest.dev/guide/migration#pool-rework` (R12).
- [ ] GitHub Actions `BDD (Cucumber)` job reports `pass` after the squash.

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` — auto-slices on >400 LOC.
- **This change's effective strategy**: **single PR**. ~5 net LOC sits at ~1% of the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended**.
- **Branch**: `feat/fix-vitest-4-deprecation` cut from `develop` at HEAD `b0f5d24` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa).
- **Risk profile**: 5 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1-R5); all have concrete mitigations already engineered into the 2 tasks (vitest pinned at 4.1.9 via `pnpm-workspace.yaml`; upstream migration guide as authoritative source for the `pool/maxWorkers/isolate` mapping; 25-test state-coverage harness as the regression surface; repo-wide grep evidence that no other `vitest.config.*` uses `poolOptions`).

---

## §5. Apply order

1. **Create branch** `feat/fix-vitest-4-deprecation` off `develop@b0f5d24`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-vitest-4-deprecation
   ```
2. **Apply the 2 commits** in dependency order per §2 above (T1 → T2). Each commit lands ATOMICALLY — never split, never squash mid-stream.
3. **Run local verification** with T1's 12 gates (G1-G12) and T2's 7 gates (VM1-VM7):
   ```bash
   pnpm install                                    # ensure vitest 4.1.9 is resolved (deterministic via pnpm-workspace.yaml)
   pnpm --filter web test                          # MUST exit 0; "Tests 145 passed (145)"
   pnpm --filter web test 2>&1 | grep -F 'DEPRECATED test.poolOptions'   # MUST exit 1 (empty output)
   pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx   # MUST exit 0; 25 PASS
   pnpm --filter api test                          # MUST exit 0; 22 PASS
   pnpm turbo run bdd                              # MUST exit 0; 43 scenarios
   pnpm turbo run lint typecheck                   # MUST exit 0
   pnpm lint:fixtures                              # MUST exit 0
   ```
4. **Pre-commit hygiene gates** (per AGENTS.md §12):
   ```bash
   grep -nE 'pool:"forks"|maxWorkers: 1|isolate: false' apps/web/vitest.config.ts   # 3 hits expected
   grep -c 'poolOptions' apps/web/vitest.config.ts                                  # 0 expected
   grep -c '@ts-expect-error' apps/web/vitest.config.ts                             # 0 expected
   git diff --name-only origin/develop..HEAD | grep -E 'vitest\.config.*$'           # 1 line: apps/web/vitest.config.ts
   git log --oneline | grep 36386e1                                                 # 1 hit (slice-7 PR-7 preserved)
   ```
5. **Push the branch**:
   ```bash
   git push -u origin feat/fix-vitest-4-deprecation
   ```
6. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-vitest-4-deprecation \
     --title "fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   PR body MUST lead with the one-line statement from spec §2: `apps/web/vitest.config.ts` migrates `poolOptions.forks.singleFork: true` to top-level `pool: "forks"` + `maxWorkers: 1` + `isolate: false` per the Vitest 4 migration guide (`https://vitest.dev/guide/migration#pool-rework`), preserving the slice-7 PR-7 single-fork semantics (R12 + R13).
7. **Wait for CI**. The `BDD (Cucumber)` job MUST report `pass`. The `turbo` gate (build + lint + typecheck + test) MUST report exit 0.
8. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-vitest-4-deprecation   # after maintainer approval
   ```
9. **`sdd-verify` runs on `develop` post-merge** to confirm the vitest gate stays green: 145/145 web + 25/25 state-coverage + 22/22 api + 43/43 BDD + `pnpm turbo run lint typecheck` exits 0, AND the `DEPRECATED test.poolOptions` marker is gone from stderr.
10. **`sdd-archive` moves** `openspec/changes/fix-vitest-4-deprecation/{proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

(All 4 deferred from proposal §8 were resolved in `spec.md` §11.)

- **Q1 (JSDoc rationale)**: YES — refreshed paragraph at L40-58 of the final config, citing slice-7 PR-7 commit `36386e1` + the Vitest 4 migration guide URL + a `DO NOT drop maxWorkers: 1` warning. R6 enforces.
- **Q2 (symmetry migration of other 9 configs)**: NO — only `apps/web/vitest.config.ts` uses the deprecated `poolOptions` pattern (verified by repo-wide grep). The other 9 configs (`apps/api`, `libs/shared-utils/*`, `libs/core/*`, `libs/features/*/vitest.config.*`) are out of scope. R7 enforces.
- **Q3 (vitest config unit test)**: NO — AGENTS.md §4 exception covers this pure config change; verification is via the existing test suite staying green + the deprecation warning disappearing. R8 + R9 + R13 are the verification surfaces.
- **Q4 (ADR)**: NO — 1-file config change linking to the official migration guide (per R12) is the documentation surface. The JSDoc paragraph at L40-58 carries the rationale + the upstream URL.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 2 tasks above.

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §10 + `proposal.md` §2.2 + AGENTS.md §11.)

1. No vitest version bump (stays pinned at `4.1.9`).
2. No migration of the other 9 `vitest.config.*` files (none use `poolOptions`).
3. No test-file / component / BDD / ESLint / CI / Turbo / workspace edits.
4. No slice-7 PR-7 history edits — commit `36386e1` stays immutable.
5. No new tests (AGENTS.md §4 exception covers this pure config change).
6. No new ESLint rule in `tools/eslint-plugin-boundary/` (the change is a vitest-runtime config edit, not a code-boundary guard).
7. No ADR under `docs/architecture/decisions/` (1-file config change with link to official migration guide is the documentation surface).
8. No coverage gate enforcement at CI (AGENTS.md §11).
9. No migration of `gastos-personales/` to the vertical-slicing model (AGENTS.md §11).
10. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
11. No touching of `apps/web/__tests__/setup.ts` (PR #66 hoisted mock stays the single source of truth for `next/navigation`).
12. No touching of `apps/web/components/`, `apps/web/lib/`, `apps/web/app/`, `apps/api/`, `libs/features/*/`, `libs/core/*/` source files.
13. No touching of `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift,fix-bdd-tsx-node22,fix-ci-env-propagation,fix-orphan-shared-directories-mirror}/`.
14. No Spanish mirror of any file under `openspec/changes/fix-vitest-4-deprecation/` (change-folder specs are coordination artifacts, not user-facing docs; per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-bdd-tsx-node22` precedents).
15. No `tsconfig.base.json` changes (`isolatedModules: true` is unrelated).
16. No `@vitest/coverage-v8` setup changes (coverage gate stays disabled per AGENTS.md §11).
17. No `pnpm-workspace.yaml` changes (vitest `4.1.9` pin stays).
18. No `.github/workflows/ci.yml` changes (the BDD job runs the same `pnpm turbo run bdd`; output now includes a clean web stderr instead of the deprecation warning).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1-R5 with concrete task-level mitigations.)

- **R1 (different deprecation marker between vitest patch versions)** — Low. Mitigated by T1's G12 verification (`git diff ... -- package.json ... | grep '"vitest"'` is empty — vitest stays pinned at 4.1.9 via `pnpm-workspace.yaml`; install is deterministic; the exact `DEPRECATED test.poolOptions` substring is the stable marker for vitest 4.1.x).
- **R2 (`maxWorkers: 1` + `isolate: false` differs semantically from `singleFork: true`, re-introduces slice-7 OOM)** — Low. The Vitest 4 migration guide (`https://vitest.dev/guide/migration#pool-rework`) is explicit that `singleFork` is replaced by `maxWorkers: 1, isolate: false`. T1's G9 verification (`pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0; 25 PASS / 0 FAIL) is the regression-surface gate. If the OOM regresses, it surfaces there first.
- **R3 (removing `@ts-expect-error` exposes a type error elsewhere)** — Low. The remaining `pool`, `maxWorkers`, and `isolate` keys are all members of the upstream `InlineConfig` type in vitest 4.1.9. The `@ts-expect-error` only suppressed the removed `poolOptions` key (which is absent from vitest 4's `InlineConfig`). T1's G10 verification (`pnpm turbo run typecheck` exits 0) catches any residual type mismatch.
- **R4 (other `vitest.config.*` files use `poolOptions` and were missed)** — None. Repo-wide grep confirms only `apps/web/vitest.config.ts:54-63` matches `poolOptions`. The other 9 configs do not use the deprecated pattern. T1's G11 verification (`git diff --name-only ... | grep -E 'vitest\.config.*$'` returns exactly 1 line) catches any accidental scope creep.
- **R5 (deprecation wording differs between pinned and installed vitest)** — Low. vitest is pinned via `pnpm-workspace.yaml`; install is deterministic; the marker substring is the stable vitest 4.1.x contract.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | ~5 net LOC (+14 / −12 raw + 1 framing LOC for the migration hunk, per `design.md` §2 File 1 footer) |
| **400-line budget risk** | Low (5 ≪ 400; ~1% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (5 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 5 net LOC well under 400; one PR keeps the loader-fix story coherent (config shape → verification marker) |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 5 risks have concrete mitigations already engineered into the 2 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, source design §4) · `risks`: R1-R5 (concrete mitigations baked into the 2 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-vitest-4-deprecation` off `develop@b0f5d24` and applies the 2 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-vitest-4-deprecation/proposal.md` (Engram `#2396`, 96 LOC)
- **Spec**: `openspec/changes/fix-vitest-4-deprecation/spec.md` (Engram `#2397`, 150 LOC; 7 goals, 13 requirements, 7 scenarios, 20 acceptance criteria)
- **Design**: `openspec/changes/fix-vitest-4-deprecation/design.md` (Engram `#2398`, 456 LOC, 13 sections; 1 file diff, 2 atomic commits, 10 execution steps)
- **Explore brief**: `openspec/changes/fix-coverage-minor-subfailures/explore.md` (Engram `#2394`; refuted orchestrator hypothesis + identified Shape A)
- **Smoking-gun deprecation marker**: `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.`
- **Vitest 4 migration guide (authoritative source)**: `https://vitest.dev/guide/migration#pool-rework`
- **Only file affected**: `apps/web/vitest.config.ts` (120 lines; `pool: "forks"` at L54, `poolOptions` block at L59-63, `@ts-expect-error` at L55-58)
- **Regression surface (slice-7 PR-7 repro)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (25/25 PASS pre- and post-fix)
- **Predecessor slice-7 PR-7 commit**: `36386e1` — introduced `pool: "forks"` + `poolOptions.forks.singleFork: true` workaround for happy-dom 20.10 + vitest 4.1 worker-pool instability. **PRESERVED unchanged by this PR.**
- **Vitest config wiring**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`) — wires the PR #66 global mock
- **Untouched BDD surface**: all 12 `.feature` files (6 auth + 6 transactions), all 5 `.steps.ts` files (3 auth + 2 transactions), both `world.ts` files, both `support/register.ts` files, both `cucumber.mjs` files
- **CI workflow**: `.github/workflows/ci.yml` `BDD (Cucumber)` job — unchanged (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout); output now includes a clean web stderr instead of the deprecation warning
- **Format reference**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/tasks.md` (closest precedent — also a config-only fix with TDD exception; mirrored the 10-section structure, compressed for the smaller change scope — 2 tasks vs 4, no threat matrix, no Spanish mirror, no separate ADR, no `scripts/bdd/verify.sh`)
- **Project conventions**: AGENTS.md §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — exception for pure config, vacuously satisfied), §5 (atomic commits — 2 work-unit commits), §6 (Conventional Commits — `fix`, `chore` types; no AI attribution), §7 (boundary plugin — none affected), §8 (single source of truth — vitest runtime config keys canonical at the upstream `InlineConfig` site), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope — none touched), §12 (pre-commit checklist), §13 (Spanish mirror — N/A for change-folder design per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-bdd-tsx-node22` precedents)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**END OF TASKS**.
