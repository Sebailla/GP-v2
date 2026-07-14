# Tasks — `fix-web-vitest-crash` — `gastos-personales-reference`

> **Status**: draft · tasks phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `d9fdfec`) · tracker `feat/fix-web-vitest-crash` (off develop)
> **Mode**: `auto` · **Artifact store**: hybrid · **Delivery**: `auto-chain` (>400 LOC) — **N/A this change** (28 net LOC)
> **Strict TDD**: ACTIVE (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Approval inputs**: `proposal.md` (Engram `#2362`), `spec.md` (Engram `#2363`, G1–G6, R1–R10, 6 scenarios, 20 ACs), `design.md` (Engram `#2364`, 1 file edit, 2 atomic commits, 6 steps)
> **Single PR**: 1 file edited (`apps/web/__tests__/setup.ts`, +28 / 0), 2 atomic commits
> **Author**: SDD orchestrator → `sdd-tasks` (executor)
> **Next phase**: user pauses before `sdd-apply` (per orchestrator protocol — interim check on 28-LOC small-but-impactful fix)

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. The change lands as a single test-infra edit; the production behavior of any component is unchanged.
- **No "Co-Authored-By"** trailers (AGENTS.md §6 / project rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: the RED is the EXISTING `pnpm --filter web test` exit-1 (25/145 failing after 255s OOM). No new test file is needed; `state-coverage.test.tsx` IS the regression surface per AGENTS.md §4 ("a failing test that reproduces the failure must exist BEFORE the production change" — the existing file already exists, the change makes it pass).
- **`MUST / SHALL / MUST NOT`** are RFC 2119; anything weaker (should, may) is non-binding.
- The 2 tasks below map 1:1 to the 2 atomic commits in `design.md` §4. **No 3rd commit. No merging mid-stream.**

---

## §1. Dependency graph

```
T1 (test-infra hoist: vi.mock("next/navigation", …) + JSDoc in setup.ts)
    │
    ▼
T2 (chore verify marker — full turbo pipeline, no file changes)
```

**Execution order invariant**: `T1 → T2`. T1 is the only file edit (the GREEN-causing change); T2 is the verification gate that proves the GREEN observation is real and that the slice-7 PR-7 `pool: "forks"` workaround coexists cleanly.

---

## §2. Per-task tables (2 tasks)

### T1 — Hoist `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts`

| Field | Value |
|-------|-------|
| Commit | `test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (closes apps/web vitest OOM)` |
| Files | `apps/web/__tests__/setup.ts` (EDIT, +28 / 0) |
| Depends on | — (RED is already observed: `pnpm --filter web test` exits 1 with 25/145 failing, V8 heap ~4 GB, `Worker exited unexpectedly`, 255s wall time) |
| LOC | +28 / 0 |
| TDD | RED → GREEN. The RED is the existing exit-1 of `state-coverage.test.tsx` (no new test file needed per AGENTS.md §4 exception). This commit lands the GREEN. Edit `apps/web/__tests__/setup.ts` to (a) add `import { vi } from "vitest";` after the existing `import "@testing-library/jest-dom/vitest";` at L1; (b) extend the existing JSDoc block (L3-21) with a paragraph explaining the `next/navigation` invariant, the OOM cascade, the slice-7 PR-7 workaround coexistence, and the file's single-source-of-truth role per spec R9; (c) append a `// Factory form is REQUIRED …` comment block above the new `vi.mock` call explaining the factory form, the full router shape rationale, and the `URLSearchParams` / `useParams` rationale per design §2 File 1; (d) append `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }))` at the end of the file. Factory form is REQUIRED (Vitest hoists `vi.mock` above all imports; `vi.fn()` stubs are recreated per test under `clearMocks: true` at `apps/web/vitest.config.ts:38`). `useSearchParams` returns `new URLSearchParams()` (WHATWG spec class implemented at full fidelity in happy-dom 20.10). `useParams` returns `{}` so a future component that destructures it does not crash on `undefined`. |
| Verify | `pnpm --filter web test` MUST exit 0 with `Tests 145 passed (145)` and wall time MUST be <30s (down from 255s). stderr MUST NOT contain `Worker exited unexpectedly` or `FATAL ERROR: Ineffective mark-compacts near heap limit`. `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` MUST exit 0 with 25/25 PASS (no new `.skip`/`.todo` decoration per AC11). AC1 (`grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit), AC2 (factory returns full router shape), AC3 (factory returns `usePathname`/`useSearchParams`/`useParams` stubs), AC4 (JSDoc prose explains happy-dom + OOM cascade) all hold. |

---

### T2 — Chore verify marker (full turbo pipeline, no file changes)

| Field | Value |
|-------|-------|
| Commit | `chore(web): verify pnpm --filter web test exits 0 with 145/145 (R4 marker)` |
| Files | (no file changes — verification gate only; the orchestrator MAY elide this commit if the verification runs on the prior commit's tree instead) |
| Depends on | T1 |
| LOC | 0 / 0 |
| TDD | REFACTOR gate. Re-run the full turbo pipeline to confirm (a) the apps/web unit test suite stays GREEN, (b) the BDD gate is not regressed (was 43/43 on `develop@d9fdfec` per Engram `#2278`), (c) ESLint boundary fixtures still pass (no new rule needed; the mock is test-infra, not a code-boundary guard per proposal §4.3), (d) TypeScript still compiles cleanly. This commit exists to give the slice-8 close-out a paper trail distinguishing the GREEN observation (this commit) from the GREEN-causing change (T1). Splits the WHY from the WHAT in the commit log. |
| Verify | `pnpm turbo run test bdd lint typecheck` MUST exit 0 on all 4 turbo tasks. `pnpm --filter web test` MUST show `Tests 145 passed (145)`. `pnpm turbo run bdd` MUST show 43/43 PASS. `pnpm lint:fixtures` MUST exit 0 (the 5 active boundary rules — `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs` — stay green; no new rule is added per spec §7.1). `git log feat/fix-web-vitest-crash --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (AC16). The slice-7 PR-7 workaround at `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) MUST remain unchanged (AC6, AC15). |

---

## §3. PR plan (single PR)

**PR title**: `test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (closes apps/web vitest OOM)`

**Branch**: `feat/fix-web-vitest-crash` (cut from `develop` at HEAD `d9fdfec`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2; AC18)

**Merge strategy**: squash-merge at PR end (standard for single-PR fixes; preserves the 2-commit story in the PR description while collapsing to a single revertible change on `develop`). The PR body MUST include a "Context" section per spec R10 that names apps/web vitest as the LAST failing gate from the slice-8 verify after a 4-PR BDD bypass streak (so reviewers don't re-walk the slice-8 PR-2 / `auth-server` split red herring).

**Pre-PR checklist**:

- [ ] All 2 commits land in order on `feat/fix-web-vitest-crash` (T1 → T2).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AC16).
- [ ] `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (AC7).
- [ ] `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR"` exits 1 — no OOM signature in stderr (AC8).
- [ ] `time pnpm --filter web test` reports `real` < 30s (AC9, down from 255s).
- [ ] `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25/25 PASS (AC10).
- [ ] `pnpm turbo run bdd` exits 0 with 43/43 (AC12, no BDD regression).
- [ ] `pnpm lint:fixtures` exits 0 (AC5/AC6 — boundary plugin still passes).
- [ ] `git diff --name-only develop..feat/fix-web-vitest-crash -- 'apps/web/'` returns exactly `apps/web/__tests__/setup.ts` (AC14 — only setup.ts is edited under apps/web).
- [ ] `git diff --stat develop..feat/fix-web-vitest-crash -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` is empty (AC13 — no source file touched).
- [ ] `grep "pool" apps/web/vitest.config.ts` still shows `pool: "forks"` and `singleFork: true` (AC6 — slice-7 workaround preserved).
- [ ] `git log --oneline feat/fix-web-vitest-crash | grep 36386e1` returns 1 hit (AC15 — slice-7 PR-7 commit preserved).
- [ ] The diff does NOT include any component source file under `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, or `libs/**`.
- [ ] The slice-7 PR-7 `pool: 'forks'` setting is preserved (AC6, AC8).
- [ ] GitHub Actions apps/web tests CI job reports `pass` (this job is currently failing on develop; first time it'll be green since slice-7).

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` (auto-slices on >400 LOC).
- **This change's effective strategy**: single PR. 28 net LOC sits well under the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended** for `fix-web-vitest-crash`.
- **Branch**: `feat/fix-web-vitest-crash` cut from `develop@d9fdfec` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa). Run `gentle-ai review start` after the 2 commits land on the branch.
- **Risk profile**: 5 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1–R5); all have concrete mitigations already in the design.

---

## §5. Apply order

1. **Create branch** `feat/fix-web-vitest-crash` off `develop@d9fdfec`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-web-vitest-crash
   ```
2. **Apply the 2 commits** in strict TDD order per §2 above (T1 → T2). Each commit lands ATOMICALLY — never split, never squash mid-stream.
3. **Run the full turbo verification**:
   ```bash
   pnpm install
   pnpm turbo run test bdd lint typecheck   # MUST exit 0
   pnpm --filter web test                   # MUST exit 0; 145/145 PASS; wall <30s
   pnpm turbo run bdd                       # MUST exit 0; 43/43 PASS
   pnpm lint:fixtures                       # MUST exit 0
   ```
4. **Push the branch**:
   ```bash
   git push -u origin feat/fix-web-vitest-crash
   ```
5. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-web-vitest-crash \
     --title "test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (closes apps/web vitest OOM)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   The PR body MUST include a "Context" section (per spec R10) that names apps/web vitest as the LAST failing gate from the slice-8 verify after a 4-PR BDD bypass streak.
6. **Wait for CI** (turbo + lint:fixtures + boundary-plugin fixtures + GitHub Actions apps/web tests job). The apps/web tests job MUST report `pass` — this is the primary signal (first time it'll be green since slice-7).
7. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-web-vitest-crash   # after maintainer approval
   ```
8. **`sdd-verify` runs on `develop` post-merge** to confirm Gate 3 of slice-8 closes (the 145/145 flip + the preserved slice-7 workaround + the BDD gate still green + the 1-file diff per AC14).
9. **`sdd-archive` moves** `openspec/changes/fix-web-vitest-crash/{explore,proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

- **Q1 (mock surface area — JSDoc vs new ADR)**: **JSDoc comment block in `setup.ts` (NO new ADR)**. Resolved in `spec.md` §11.
- **Q2 (full router behavior vs minimal `useRouter()` stub)**: **Minimal stub — `useRouter()` only** (the factory returns the 4 hooks but `useRouter` is the only one with multiple methods). Resolved in `spec.md` §11.
- **Q3 (mock `next/link` / `next/router` / `next/headers`?)**: **NO. App Router only.** Resolved in `spec.md` §11.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 2 tasks above.

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §4 + `proposal.md` §2.2 + AGENTS.md §11.)

1. No vitest version upgrade (4.1.9 → v5 or any other major version).
2. No removal of the slice-7 PR-7 `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` workaround at `apps/web/vitest.config.ts:54-63` (commit `36386e1`) — PRESERVED, not removed. Mitigates a different failure mode (React 18 `useEffect`-driven state-update race in `EditTransactionForm`'s mount-then-load-then-setState pattern).
3. No changes to the 3 form components (`apps/web/components/transactions/TransactionsList.tsx`, `CreateTransactionForm.tsx`, `EditTransactionForm.tsx`) or any other source code in `apps/web/components/`, `apps/web/lib/`, or `apps/web/app/`.
4. The 2 minor sub-failures in `apps/web/__tests__/components/transactions/state-coverage.test.tsx` SessionList scenarios (`findByText(/500/i)` matches `'500 '` with a trailing space because the mocked `Response` has no `statusText`) — separate ticket. Independent of the OOM cascade.
5. The vitest-4 `test.poolOptions` deprecation warning ("`test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options") — separate ticket. Will become a hard error in vitest 5.
6. The orphan shared dirs (`libs/features/*/shared/` with empty imports) — separate ticket, slice-7 inheritance debt.
7. Refactoring `TransactionsList` / `CreateTransactionForm` / `EditTransactionForm` to not call `useRouter()` — production code stays as-is.
8. Removing the per-file `vi.mock("next/navigation", …)` block at `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49` — the global mock makes it redundant, but removal is a follow-up cleanup.
9. Mocking `next/link` (JSX component, not a hook), `next/router` (pages-router equivalent, not used), or `next/headers` (server-only API, not used by the 3 affected components) — apps/web is App Router exclusively.
10. New ADR under `docs/architecture/decisions/` — the JSDoc paragraph in `setup.ts` is the documentation per spec Q1 resolution.
11. New ESLint rule in `tools/eslint-plugin-boundary/` — the mock is a test-infra convention, not a code-boundary guard (proposal §4.3 confirms).
12. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — the fix is apps/web-only.
13. Any new test file (no new `.test.ts` / `.test.tsx`) — the existing `state-coverage.test.tsx` is the regression surface.
14. Coverage gate enforcement at CI (AGENTS.md §11).
15. Migration of `gastos-personales/` to the vertical-slicing model (AGENTS.md §11; the playbook ships separately in slice-8 8.4).
16. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config), observability (OpenTelemetry, Prometheus, log shipping), audit log UI (AGENTS.md §11).
17. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` or amending any slice-7 chain commit (`36386e1`, `2e05fc5`).
18. A Spanish mirror of any file under `openspec/changes/fix-web-vitest-crash/` (no `.md` source of truth ships in this change; change-folder spec/design/proposal are coordination artifacts between SDD phases, not user-facing docs, per the `fix-api-nestjs-di` precedent).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1–R5 with concrete task-level mitigations.)

- **R1 (changing `setup.ts` breaks an unrelated test that was relying on the ABSENCE of a router mock)** — Low. Mitigated by the T1 verification (full 145-test suite exits 0; if any unrelated test fails, the failure mode points at a test that imports `next/navigation` directly — none currently do). The 17 currently-passing files (120 tests) will continue to pass because the mock is a no-op for tests that don't render Next.js components. `clearMocks: true` at `apps/web/vitest.config.ts:38` resets the `vi.fn()` stubs per test.
- **R2 (Vitest hoisting conflicts with the per-file `vi.mock("next/navigation", …)` in `auth/state-coverage.test.tsx:47-49`)** — Low. Mitigated by Vitest's import-order semantics (per-file `vi.mock` re-binds the factory for that file's scope). The auth tests continue to pass with the per-file mock in place — verified by the existing 120-test baseline. The per-file mock becomes redundant after this PR but is left intact for the follow-up cleanup (out of scope per spec §10).
- **R3 (vitest-4 `test.poolOptions` deprecation warning still present, may become a hard error in vitest 5)** — Low. Out of scope per spec §10; separate ticket. The slice-7 PR-7 workaround stays; the deprecation does not block this fix.
- **R4 (factory-form `useSearchParams()` returns `new URLSearchParams()` — some component may destructure methods not present in the happy-dom polyfill)** — Low. `URLSearchParams` is a WHATWG spec class implemented at full fidelity in happy-dom 20.10. The 3 affected components (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) call `useSearchParams().get("…")` only; `URLSearchParams.get` is present in happy-dom 20.10. Verified by component source (no `.entries()`, `.forEach()`, or `.keys()` usage on `useSearchParams()`).
- **R5 (PR confused with the slice-8 PR-2 `auth-server` split red herring)** — Low. Mitigated by spec R10 (PR description MUST include a "Context" section explicitly naming apps/web vitest as the LAST failing gate from the slice-8 verify after a 4-PR BDD bypass streak) + AC18 (PR base is `develop`, not `main`, which is the same base the slice-8 PR-2 used — but the file diff is completely different: this PR touches `apps/web/__tests__/setup.ts`; slice-8 PR-2 touched `apps/web/lib/auth-client.ts` and `apps/web/lib/auth-server.ts`).

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | 28 net LOC (`+28 / 0` per `design.md` §2 File 1 footer) |
| **400-line budget risk** | Low (28 << 400; 7% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (28 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 28 net LOC well under 400; one PR keeps the story coherent (RED → GREEN via setup.ts hoist → chore verify) |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 5 risks have concrete mitigations already engineered into the 2 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1–R5 (concrete mitigations baked into the 2 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-web-vitest-crash` off `develop@d9fdfec` and applies the 2 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
- **Spec**: `openspec/changes/fix-web-vitest-crash/spec.md` (Engram `#2363`; 6 goals, 10 requirements, 6 scenarios, 20 acceptance criteria)
- **Design**: `openspec/changes/fix-web-vitest-crash/design.md` (Engram `#2364`; 1 file edit, 2 atomic commits, 6 execution steps)
- **Explore brief**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
- **Root-cause evidence**: `invariant expected app router to be mounted` at `next@16.2.10/navigation.ts:179`; V8 heap ~4 GB; `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed` after 255s wall time
- **Pre-existing pattern (source for the global hoist)**: per-file `vi.mock("next/navigation", …)` at `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49`
- **Vitest config wiring**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`)
- **Slice-7 workaround (predecessor, PRESERVED)**: commit `36386e1`, `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **Slice-8 PR-2 (NOT implicated, false lead)**: commit `2e05fc5` (auth-client.ts / auth-server.ts split) — `import type` erased at compile time, transparent to vitest workers (explore brief §6)
- **Affected components**: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (inside `RowEditMenu`)
- **Regression surface**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios across 5 describe blocks)
- **Slice-8 verify report**: Engram `#2278` (confirmed BDD gate GREEN; OOM is Gate 3 / unit-tests-only)
- **Format precedent**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (8 tasks, 10 sections; mirrored for structure, adapted to 2-task scope)
- **Project conventions**: AGENTS.md §1 (stack), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — RED is the existing exit-1, no new test file), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — mock in exactly one place after this PR), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder tasks per orchestrator instruction + `fix-api-nestjs-di` precedent)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
