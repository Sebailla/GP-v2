# Delta Spec — `fix-web-vitest-crash`

> **Change**: `fix-web-vitest-crash` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `d9fdfec`) → tracker `feat/fix-web-vitest-crash`
> **Mode**: `auto` (interactive question round SKIPPED — small change, intent + root cause pre-pinned)
> **Artifact store**: hybrid
> **Date**: 2026-07-14
> **Fix shape (auto decision)**: **B** — hoist the `vi.mock("next/navigation", …)` into `apps/web/__tests__/setup.ts`. Single PR, 1 file, ~28 net LOC, well under the 400-line review budget → `delivery_strategy=auto-chain` is **NOT** triggered.
> **Proposal**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
> **Explore brief**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
> **Root cause**: missing `vi.mock("next/navigation", …)` in the test suite → Next.js 16 throws `invariant expected app router to be mounted` (`next@16.2.10/navigation.ts:179`) → React 19 fiber leak → V8 OOM kill after ~4 min.

---

## 1. Header

| Field | Value |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-web-vitest-crash` (cut from `develop@d9fdfec`) |
| Date | 2026-07-14 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Proposal Engram `#2362`; Explore Engram `#2361`; slice-7 PR-7 commit `36386e1`; slice-8 PR-2 commit `2e05fc5` |
| Fix shape | B (auto decision captured in proposal §0) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | `auto-chain` (>400 LOC auto-chains) — **N/A this change**; 28 LOC stays single-PR |

---

## 2. Intent

Slice 8 (`slice-8-closing-bdd-and-docs`) verify Gate 3 reports **apps/web unit tests fail**: `pnpm --filter web test` exits 1 after ~255 seconds (4m 15s) with `Tests 120 passed (145)` + `Worker exited unexpectedly` + V8 heap `~4073 MB` + `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed`. The root cause is verified empirically: the test file `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios) does NOT mock `next/navigation`, so when it renders `TransactionsList` (via `RowEditMenu`), `CreateTransactionForm`, and `EditTransactionForm` — each calls `useRouter()` from `next/navigation` — Next.js 16 throws `invariant expected app router to be mounted` (smoking gun: `next@16.2.10/navigation.ts:179`). 15/25 scenarios throw; React 19's concurrent-mode partial-fiber commit keeps the partial render mounted, the suite's `new Promise(() => {})` mocks (loading states) keep `useEffect` chains unresolved, fibers accumulate, V8 heap grows to ~4 GB, the worker is OOM-killed. Slice-7 PR-7's `pool: "forks"` + `singleFork: true` workaround (commit `36386e1`) only changed *when* the OOM fires, not *whether* — it does not address the root cause. The same `vi.mock("next/navigation", …)` pattern already exists in `apps/web/__tests__/components/auth/state-coverage.test.tsx` (lines 47-49) for the auth forms — a per-file mock that brittly depends on every new test file remembering the boilerplate. The verified fix: hoist that same mock to `apps/web/__tests__/setup.ts`, which is loaded by ALL 18 test files in the suite (`vitest.config.ts` line 39 already wires it via `setupFiles: ["./__tests__/setup.ts"]`). After the fix: all 145 apps/web tests pass, wall time drops from 255s → <10s, no OOM, no deprecation banner. Blast radius: 1 file edited, 18 test files silently protected against the same OOM cascade on any future router-using component.

---

## 3. Goals

### G1 — `apps/web` vitest suite exits 0 with all 145 tests passing

`pnpm --filter web test` MUST exit 0 with `Tests 145 passed (145)` and wall time MUST drop below 30 seconds (down from 255s). Before the fix the suite exits 1 with 25/145 failing (15 throws + 10 cascading as workers OOM); after the fix the 25 currently-failing scenarios turn GREEN while the 120 already-passing scenarios stay GREEN. No `Worker exited unexpectedly` and no `FATAL ERROR: Ineffective mark-compacts near heap limit` may appear in the test output.

### G2 — All 25 scenarios in `state-coverage.test.tsx` pass

All 25 scenarios in `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (5 × 5 describe blocks: TransactionsList, CreateTransactionForm, EditTransactionForm, CategoryManager, SessionList) MUST pass after the fix. The 15 currently-throwing ones flip from RED to GREEN because the hoisted mock pre-empts the `useRouter()` invariant. The 10 already-passing ones stay GREEN. (The 2 SessionList `findByText(/500/i)` sub-failures noted in the explore brief §1 are out of scope per proposal §2.2 — separate ticket.)

### G3 — The mock is durable for future router-using component tests

A new test file at `apps/web/__tests__/components/foo.test.tsx` that renders a component importing `useRouter()`, `usePathname()`, or `useSearchParams()` from `next/navigation` MUST pass without the author needing to add a per-file `vi.mock("next/navigation", …)`. The hoisted mock makes the invariant "`next/navigation` is fake in the apps/web test suite" a global convention enforced once, in setup, not per-test-file.

### G4 — BDD gate is not regressed

`pnpm turbo run bdd` MUST continue to exit 0 after the fix. The BDD gate was GREEN on `develop@d9fdfec` per the slice-8 verify report (Engram `#2278`); this fix is apps/web-only and MUST NOT touch any Cucumber feature file, step definition, or workspace-port from the BDD harness.

### G5 — No source file modifications

No file under `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, or `libs/**` may be modified by this PR. `git diff --stat develop feat/fix-web-vitest-crash` filtered by `apps/web/components/.*\.tsx$|apps/web/lib/.*\.ts$|apps/web/app/.*\.tsx$|apps/api/.*\.ts$|libs/.*\.ts$` MUST be empty. The fix is test-infrastructure-only.

### G6 — Slice-7 PR-7 `pool: 'forks'` workaround is preserved

The slice-7 PR-7 `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` workaround at `apps/web/vitest.config.ts` lines 54-63 (introduced by commit `36386e1` for the happy-dom + React 18 `useEffect`-driven state-update edge case in `EditTransactionForm`) MUST remain in `apps/web/vitest.config.ts` unchanged after this PR. The OOM fix targets the `useRouter()` invariant, a different failure mode; removing the workaround risks regressing the slice-7 symptom (mitigates the mount-then-load-then-setState pattern in `EditTransactionForm`).

---

## 4. Non-Goals

The following are explicitly **out of scope** for this change (mirrored from proposal §2.2 + AGENTS.md §11):

1. Refactoring `TransactionsList`, `CreateTransactionForm`, or `EditTransactionForm` to not call `useRouter()` — the production code stays as-is.
2. Removing the per-file `vi.mock("next/navigation", …)` block at `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 — the global mock in `setup.ts` makes it redundant, but the removal is a follow-up cleanup.
3. Mocking `next/link`, `next/router` (pages router), or `next/headers` — apps/web is App Router only; none of the affected components import these.
4. Migrating `apps/web/vitest.config.ts` `poolOptions` from vitest-3 schema to vitest-4 top-level schema — the deprecation warning remains a separate ticket (will become an error in vitest 5).
5. Upgrading vitest 4.1.9 → v5 or to any other major version.
6. Adding new test code (no new `.test.ts` or `.test.tsx` file) — the existing `state-coverage.test.tsx` is the regression surface; RED is already captured by its current exit-1.
7. Authoring a new ADR under `docs/architecture/decisions/` — the JSDoc comment block in `setup.ts` is the documentation (per interactive resolution of proposal Q1).
8. Adding a new ESLint rule to `tools/eslint-plugin-boundary/` — the mock is a test-infra convention, not a code-boundary guard.
9. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — the fix is apps/web-only.
10. Coverage gate enforcement at CI (AGENTS.md §11).
11. Migration of `gastos-personales/` to the vertical-slicing model (the playbook ships here; the migration runs in a separate change per AGENTS.md §11).
12. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config), observability (OpenTelemetry, Prometheus, log shipping), audit log UI (AGENTS.md §11).
13. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` or amending any slice-7 chain commit (`36386e1`, `2e05fc5`).
14. A Spanish mirror of `spec.md` — per orchestrator instructions, the spec is a coordination artifact between SDD phases, not a user-facing document; the mirror rule fires for `.md` files that ship as the source of truth (`docs/architecture/decisions/`), not for change-folder spec drafts.

---

## 5. Functional Requirements

> Keywords per RFC 2119. MUST = absolute requirement. SHOULD = recommended but not blocking. MAY = optional.

### R1 — `apps/web/__tests__/setup.ts` hoists a `vi.mock("next/navigation", …)` factory at the top

`apps/web/__tests__/setup.ts` MUST add a `vi.mock("next/navigation", () => ({ … }))` call placed AFTER the existing `import "@testing-library/jest-dom/vitest";` (line 1) and BEFORE any other declaration. The factory MUST be hoisted by Vitest's transform so the mock applies before any module is imported. The mock MUST export stubs for `useRouter()`, `usePathname()`, `useSearchParams()`, and `useParams()` so that any component importing any of these four app-router hooks from `next/navigation` is supported, not only the 3 currently-affected forms.

### R2 — The mock factory returns the minimal shape the 3 form components use

The `vi.mock("next/navigation", …)` factory in `setup.ts` MUST return an object with the following minimal shape:
- `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() })`
- `usePathname: () => "/"`
- `useSearchParams: () => new URLSearchParams()`
- `useParams: () => ({})`

This mirrors the per-file mock at `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 but lifts the `useRouter` return to the full router shape (the 3 transactions forms call `useRouter().push(...)` for success-path navigation, not only `useRouter().replace(...)`). The `vi.fn()` stubs MUST be fresh per test because the vitest config sets `clearMocks: true` at `apps/web/vitest.config.ts` line 38; tests do not need to manually reset between scenarios.

### R3 — `apps/web/vitest.config.ts` continues to reference `apps/web/__tests__/setup.ts`

`apps/web/vitest.config.ts` MUST continue to list `"./__tests__/setup.ts"` in the `setupFiles` array (line 39 today). This spec verifies the existing entry, does not modify it; the mock lands at the existing wiring automatically. The `pool: "forks"` and `poolOptions.forks.singleFork: true` workaround (lines 54-63) MUST remain unchanged.

### R4 — `pnpm --filter web test` exits 0 with 0 failing tests after the fix

`pnpm --filter web test` MUST exit 0 after the fix is applied. The vitest reporter MUST emit `Tests 145 passed (145)` (or a higher count if future test commits land in flight, but ≥145). Wall time MUST be below 30 seconds. No `Worker exited unexpectedly` and no `FATAL ERROR: Ineffective mark-compacts near heap limit` may appear in stderr.

### R5 — All 25 scenarios in `state-coverage.test.tsx` pass

All 25 scenarios in `apps/web/__tests__/components/transactions/state-coverage.test.tsx` MUST pass: 5 TransactionsList, 5 CreateTransactionForm, 5 EditTransactionForm, 5 CategoryManager, 5 SessionList. No `.skip` / `.todo` / `.xfail` decorator may be added to any of these 25 scenarios as a workaround. The 15 currently-throwing scenarios flip from RED (throws `invariant expected app router to be mounted`) to GREEN. The 2 SessionList `findByText(/500/i)` sub-failures are explicitly out of scope per proposal §2.2; they remain a separate ticket but MUST NOT be regressed by the fix.

### R6 — `pnpm turbo run bdd` continues to exit 0

`pnpm turbo run bdd` MUST continue to exit 0 after the fix. No Cucumber feature file, step definition, world file, or workspace-port may be modified. The BDD gate was GREEN on `develop@d9fdfec` per the slice-8 verify report (Engram `#2278`); this fix MUST preserve that.

### R7 — No component source file is touched

The PR MUST NOT modify any file under `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, or `libs/**`. `git diff --stat develop feat/fix-web-vitest-crash` filtered by the union of those paths MUST be empty. The fix is test-infrastructure-only: the only files in the PR diff are `apps/web/__tests__/setup.ts` (+28 / 0) and possibly `openspec/changes/fix-web-vitest-crash/{spec.md, design.md, tasks.md}` if the design/tasks artifacts land in the same PR. (Spec/design/tasks live under the change folder, not under any of the protected paths above.)

### R8 — The slice-7 PR-7 `pool: 'forks'` workaround is preserved

The slice-7 PR-7 workaround at `apps/web/vitest.config.ts` lines 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) MUST remain in `apps/web/vitest.config.ts` after this PR. The PR MUST NOT amend, remove, or restructure commit `36386e1` (slice-7 PR-7, "switch apps/web vitest to forks pool to mitigate happy-dom + useEffect OOM"). The workaround mitigates a separate happy-dom + React 18 timing edge case (the `EditTransactionForm` mount-then-load-then-setState pattern); the OOM fix targets the `useRouter()` invariant, a different failure mode. Both MUST coexist.

### R9 — The mock factory carries a JSDoc comment explaining why it is necessary

The `vi.mock("next/navigation", …)` block in `apps/web/__tests__/setup.ts` SHOULD be preceded by a JSDoc comment block (a `//` comment line or a paragraph added to the existing JSDoc at lines 3-21 of setup.ts) explaining: (a) happy-dom does not mount the Next.js app router, (b) components that call `useRouter()` throw `invariant expected app router to be mounted` at render time without the mock, (c) the slice-7 PR-7 `pool: "forks"` workaround only changed *when* the OOM fires, not *whether*, (d) without this mock the 15/25 state-coverage scenarios throw and the worker OOMs at ~4 GB V8 heap. The JSDoc is the documentation for this convention; per proposal Q1 resolution, no separate ADR is authored.

### R10 — The PR description explicitly references the 4-PR BDD bypass streak

The single PR description against `develop` SHOULD include a "Context" section that names apps/web vitest as the LAST failing gate from the slice 8 verify after a 4-PR BDD bypass streak (the fix unlocks Gate 3 of the slice-8 verify checklist so the slice can finally close). This gives reviewers the why-we-cared-when-we-shipped-the-workaround trail and prevents the next agent from re-walking the slice-8 PR-2 / `auth-server` split red herring.

---

## 6. Scenarios

> Gherkin Given/When/Then format. Every scenario is runnable as an automated test (or a shell greppable check).
>
> 6 scenarios total: one per goal G1–G6.

### G1 scenario (apps/web vitest suite exits 0)

#### Scenario: apps/web vitest suite exits 0 with all 145 tests passing

- GIVEN `apps/web/__tests__/setup.ts` hoists a `vi.mock("next/navigation", …)` factory with the shape defined in R2
- AND `apps/web/vitest.config.ts` continues to reference `"./__tests__/setup.ts"` in `setupFiles`
- WHEN `pnpm --filter web test` is run from the repo root on `feat/fix-web-vitest-crash`
- THEN the exit code MUST be 0
- AND the vitest reporter MUST emit `Tests 145 passed (145)`
- AND wall time MUST be below 30 seconds
- AND the stderr MUST NOT contain `Worker exited unexpectedly`
- AND the stderr MUST NOT contain `FATAL ERROR: Ineffective mark-compacts near heap limit`

### G2 scenario (state-coverage scenarios pass)

#### Scenario: state-coverage.test.tsx all 25 scenarios pass

- GIVEN the hoisted mock from R1/R2 is applied globally to every test in the apps/web suite
- WHEN `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` is run
- THEN 25 of 25 scenarios MUST pass (5 TransactionsList + 5 CreateTransactionForm + 5 EditTransactionForm + 5 CategoryManager + 5 SessionList)
- AND the exit code MUST be 0
- AND no `.skip` / `.todo` / `.xfail` decorator may have been added

### G3 scenario (mock is durable for future tests)

#### Scenario: A new test file that renders a router-using component works without per-file mock

- GIVEN a hypothetical new test file at `apps/web/__tests__/components/foo.test.tsx` that imports a hypothetical component `Foo` which calls `useRouter()` from `next/navigation`
- AND the new test file does NOT declare any per-file `vi.mock("next/navigation", …)` block
- WHEN `pnpm --filter web test foo.test.tsx` is run
- THEN the test MUST pass without a `invariant expected app router to be mounted` error
- AND the test MUST pass without the author needing to add a per-file mock
- AND the global mock in `setup.ts` MUST be the sole source of the fake router

### G4 scenario (BDD gate not regressed)

#### Scenario: BDD suite still passes 43/43 after the fix

- GIVEN the apps/web vitest fix has been applied (R1, R2, R4)
- WHEN `pnpm turbo run bdd` is run from the repo root on `feat/fix-web-vitest-crash`
- THEN all BDD scenarios MUST continue to pass (43/43, matching the slice-8 verify report's GREEN count)
- AND the exit code MUST be 0
- AND no Cucumber feature file, step definition, or world file may appear in `git diff --stat develop feat/fix-web-vitest-crash`

### G5 scenario (no source file touched)

#### Scenario: No source file under apps/web or apps/api or libs is modified

- GIVEN the PR diff between `feat/fix-web-vitest-crash` and `develop` is computed
- WHEN the diff is filtered by `apps/web/components/.*\.tsx$|apps/web/lib/.*\.ts$|apps/web/app/.*\.tsx$|apps/api/.*\.ts$|libs/.*\.ts$`
- THEN the filtered file list MUST be empty
- AND the only changed files MUST be `apps/web/__tests__/setup.ts` plus the SDD artifacts under `openspec/changes/fix-web-vitest-crash/`

### G6 scenario (slice-7 workaround preserved)

#### Scenario: pool: 'forks' workaround is preserved unchanged

- GIVEN `apps/web/vitest.config.ts` has `pool: "forks"` at line 54 and `poolOptions: { forks: { singleFork: true } }` at lines 59-63 (slice-7 PR-7, commit `36386e1`)
- WHEN the new PR lands and `git show feat/fix-web-vitest-crash:apps/web/vitest.config.ts` is inspected
- THEN the `pool: "forks"` setting MUST remain unchanged
- AND the `poolOptions.forks.singleFork: true` setting MUST remain unchanged
- AND the `@ts-expect-error` comment on the `poolOptions` block MUST remain unchanged
- AND commit `36386e1` MUST NOT be amended, rebased, or removed

---

## 7. Constraint Surface

### 7.1 Architectural boundaries (AGENTS.md §7 — enforced by ESLint)

- **`no-prisma-outside-core`**: untouched, irrelevant; the fix touches no Prisma code.
- **`no-schemas-outside-shared`**: untouched, irrelevant; the fix touches no Zod schemas.
- **`no-client-server-import`**: untouched. The mock is at the test boundary; component code keeps its server-vs-client split correctly. The fix honors the existing `import "server-only"` shim at `apps/web/vitest.config.ts` lines 114-117.
- **`no-cross-module-import`**: untouched, irrelevant; no feature module imports change.
- **`no-mojibake-in-docs`**: untouched. This spec lives under `openspec/changes/` and is a coordination artifact (per orchestrator instruction + AGENTS.md §13 exception precedent: change-folder specs are not mirrored).
- **`no-import-type-injectable`** (introduced by `fix-api-nestjs-di`): not implicated. The mock is in `apps/web/__tests__/`, not in a `*.controller.ts` or `*.service.ts`.

The boundary plugin does NOT gain a new rule for this fix — confirmed by proposal §4.3.

### 7.2 Strict TDD (AGENTS.md §4)

The fix follows **RED → GREEN → TRIANGULATE → REFACTOR** order. The existing RED is captured by `pnpm --filter web test` exit-1 (25/145 failing). The GREEN lands when the same command exits 0. No new test file is needed — `state-coverage.test.tsx` is the regression surface, per AGENTS.md §4 ("a failing test that reproduces the failure must exist BEFORE the production change"; the existing file already exists, the change makes it pass).

| Step | Order | Test first? | Production code first? |
|------|-------|-------------|------------------------|
| 1 | RED is observed (existing) | `pnpm --filter web test` exits 1, 25 fail | no |
| 2 | Edit `apps/web/__tests__/setup.ts` (add hoisted `vi.mock`) | already RED via step 1 | YES (GREEN: exit 0) |
| 3 | Verify full pipeline (`pnpm turbo run test bdd lint typecheck`) | n/a | n/a |
| 4 | PR review | n/a | n/a |

### 7.3 Atomic commits (AGENTS.md §5) and Conventional Commits (AGENTS.md §6)

- Every commit is a work-unit (test + production change + docs land together). This change is small enough for a single commit: `fix(web): hoist next/navigation mock to vitest setup to stop OOM in state-coverage suite`.
- No "Co-Authored-By" / no AI attribution in any commit message.
- Type vocabulary: `fix`, `test`, `docs`, `chore`, `refactor`.
- Subject ≤72 chars, imperative, no trailing period.

### 7.4 Branch model (AGENTS.md §2)

- Work branch: `feat/fix-web-vitest-crash` cut from `develop` (NOT from `main`).
- `main` is immutable; no force-push, no delete, no amend of historic commits.
- `git revert <merge-sha>` cleanly reverses the entire PR.
- The slice-7 chain evidence (`36386e1`, `2e05fc5`) is preserved untouched.

### 7.5 Single source of truth (AGENTS.md §8)

- The `vi.mock("next/navigation", …)` lives in exactly ONE place after this PR: `apps/web/__tests__/setup.ts`. The per-file copy at `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 becomes redundant but stays untouched per proposal §2.2 (follow-up cleanup).
- Component source files (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) keep their `useRouter()` calls — there is exactly one source of truth for what the router object should look like (Next.js's `next/dist/client/components/navigation.ts`), and the mock is a faithful test-side approximation.

### 7.6 Spanish mirror (AGENTS.md §13)

- This `spec.md` is intentionally NOT mirrored at spec-creation time. Per orchestrator instruction + the `fix-api-nestjs-di` precedent (`openspec/changes/archive/2026-07-13-fix-api-nestjs-di/spec.md` was likewise not mirrored), the change-folder spec is a coordination artifact between SDD phases. The mirror rule fires for `.md` files under `docs/` that ship as the source of truth. This change introduces none.

---

## 8. Test Plan

| Goal | Test command | Expected outcome |
|------|--------------|------------------|
| G1 (vitest suite 0) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; wall <30s; no OOM |
| G2 (state-coverage 25/25) | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS |
| G3 (durable mock) | `pnpm --filter web test` + a hypothetical new test file under `apps/web/__tests__/` | new test file passes without per-file mock (validated by re-running the existing 18 files + adding one new minimal smoke test if the reviewer wants; the hoist itself is the durable proof — see G1's `Tests 145 passed` count covers existing files) |
| G4 (BDD gate) | `pnpm turbo run bdd` | exit 0; 43/43 scenarios continue to pass |
| G5 (no source touched) | `git diff --stat develop feat/fix-web-vitest-crash` filtered by the protected paths | filtered list is empty |
| G6 (slice-7 workaround preserved) | `git show feat/fix-web-vitest-crash:apps/web/vitest.config.ts` + `git log --oneline feat/fix-web-vitest-crash 36386e1 -1` | vitest.config.ts `pool` + `poolOptions` unchanged; commit `36386e1` still present |

### Manual / non-CI verification steps

- `pnpm --filter web test --reporter=verbose` to enumerate each of the 145 scenarios and confirm no `.skip` / `.todo` decoration.
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR|invariant expected"` to confirm the OOM signature is absent from stderr.
- `git log --oneline develop..feat/fix-web-vitest-crash` to confirm a single work-unit commit (subject ≤72 chars, no "Co-Authored-By").
- `git show 36386e1 -- apps/web/vitest.config.ts` to confirm the slice-7 workaround commit is preserved (NOT amended or rebased).
- Read `apps/web/__tests__/setup.ts` to confirm the JSDoc paragraph from R9 is present and accurate.

---

## 9. Acceptance Criteria

> Binary pass/fail conditions for `sdd-verify`. Every criterion is testable from a fresh `git checkout feat/fix-web-vitest-crash && pnpm install`.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| AC1 | `setup.ts` contains the hoisted mock | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit |
| AC2 | Mock returns the full router shape | the mock factory MUST export `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() })` |
| AC3 | Mock returns `usePathname` / `useSearchParams` / `useParams` stubs | the mock factory MUST export `usePathname: () => "/"`, `useSearchParams: () => new URLSearchParams()`, `useParams: () => ({})` |
| AC4 | JSDoc paragraph explains why (R9) | the file MUST contain prose explaining happy-dom app-router absence + the OOM cascade |
| AC5 | `vitest.config.ts` setupFiles is unchanged | `grep -n 'setupFiles' apps/web/vitest.config.ts` shows `["./__tests__/setup.ts"]` at line 39 (or its post-edit line number) |
| AC6 | `vitest.config.ts` `pool: "forks"` is unchanged | the line MUST still read `pool: "forks"` and `poolOptions.forks.singleFork: true` (R8 / G6) |
| AC7 | `pnpm --filter web test` exits 0 | exit code 0; `Tests 145 passed (145)` (or higher if more tests land) |
| AC8 | No OOM in stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` exits 1 (no match) |
| AC9 | Wall time below 30 s | `time pnpm --filter web test` reports `real` < 30s |
| AC10 | state-coverage.test.tsx all 25 pass | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` exits 0; reporter emits 25 PASS / 0 FAIL |
| AC11 | No `.skip` / `.todo` decoration added | `grep -E "\\.(skip\|todo)\\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns the same hit count as on `develop@d9fdfec` (no new decorations) |
| AC12 | BDD gate still passes | `pnpm turbo run bdd` exits 0 |
| AC13 | No source file touched | `git diff --stat develop..feat/fix-web-vitest-crash -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` returns empty |
| AC14 | Only `setup.ts` is edited under `apps/web/` | `git diff --name-only develop..feat/fix-web-vitest-crash -- 'apps/web/'` returns exactly one `apps/web/__tests__/setup.ts` (plus possibly change-folder SDD artifacts under `openspec/changes/fix-web-vitest-crash/`) |
| AC15 | Commit `36386e1` is preserved | `git log --oneline feat/fix-web-vitest-crash \| grep 36386e1` returns 1 hit |
| AC16 | No "Co-Authored-By" in any commit | `git log feat/fix-web-vitest-crash --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC17 | Commit subject is Conventional + ≤72 chars | `git log -1 feat/fix-web-vitest-crash --pretty=format:"%s"` matches `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` and is ≤72 chars |
| AC18 | PR base branch is `develop` | the PR's `base` ref is `develop` (NOT `main`) |
| AC19 | Mock is durable for future files | `pnpm --filter web test` count includes the 18 existing files (≥145 tests across ≥18 files) — proves the setup.ts mock is global, not per-file |
| AC20 | Single PR, no force-push | the merge is a single squash or merge commit; `git log develop..feat/fix-web-vitest-crash --merges` returns ≤1 commit; no history rewrite |

---

## 10. Out of Scope

(Mirrored from proposal §2.2 + AGENTS.md §11; non-goals above are operational, this section is the formal review check.)

1. Anything in AGENTS.md §11.
2. Refactoring `TransactionsList`, `CreateTransactionForm`, or `EditTransactionForm` to not call `useRouter()`.
3. Removing the per-file mock at `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 (follow-up cleanup).
4. Mocking `next/link`, `next/router` (pages router), or `next/headers` (apps/web is App Router only).
5. Migrating vitest `poolOptions` from v3 to v4 top-level schema (deprecation warning becomes an error in vitest 5; separate ticket).
6. Upgrading vitest 4.1.9 to v5 or any other major version.
7. Adding new test code (no new `.test.ts` / `.test.tsx` file).
8. Authoring a new ADR under `docs/architecture/decisions/` (JSDoc in `setup.ts` is the documentation per Q1).
9. Adding a new ESLint rule to `tools/eslint-plugin-boundary/`.
10. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/`.
11. Coverage gate enforcement at CI.
12. Migration of `gastos-personales/` to the vertical-slicing model (the playbook ships here; the migration runs in slice-8 8.4 per AGENTS.md §11).
13. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config), observability (OpenTelemetry, Prometheus, log shipping), audit log UI.
14. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`.
15. Amending, rebasing, or removing commits `36386e1` (slice-7 PR-7 workaround) or `2e05fc5` (slice-8 PR-2 auth split, false lead to be preserved as historical evidence).
16. The 2 SessionList `findByText(/500/i)` sub-failures (separate ticket; not the OOM root cause per explore §4.2).
17. A Spanish mirror of any file under `openspec/changes/fix-web-vitest-crash/` (no `.md` source of truth ships in this change).

---

## 11. Open Questions — RESOLVED

The proposal deferred 3 questions to the spec phase. They are now resolved:

### Q1 — Author a new ADR for the mock or rely on JSDoc?

**Resolved**: **JSDoc comment block in `setup.ts` (NO new ADR)**.

Rationale: the architectural decision here is essentially "in the test environment, `next/navigation` is a fake". That is a one-line convention, not a multi-paragraph rationale. A JSDoc paragraph in `setup.ts` (R9) puts the explanation where the future maintainer actually reads code (the file with the convention), not in a separate doc that has to be discovered. The slice-1 ESLint-plugin-boundary pattern follows the same "explain at the canonical site" principle.

### Q2 — Full router behavior or minimal `useRouter()` stub?

**Resolved**: **Minimal stub — `useRouter()` only** (the factory returns the 4 hooks but `useRouter` is the only one with multiple methods).

Rationale: the 3 affected form components (`TransactionsList` via `RowEditMenu`, `CreateTransactionForm`, `EditTransactionForm`) call `useRouter().push(...)` in success paths; the auth forms (`ResetPasswordForm`, `SignUpForm`) call `useRouter().replace(...)`. The factory therefore returns the full router shape (`push`, `replace`, `back`, `forward`, `refresh`, `prefetch`) so any future call site is covered. `usePathname()` returns `"/"` and `useSearchParams()` returns a fresh `URLSearchParams()` — the 3 components don't call them, but exporting the stubs prevents any future component that does from regressing. (Mirror failure mode: a future component that destructures `useParams()` would crash on `undefined`, so R1 also stubs `useParams: () => ({})`.)

The `vi.fn()` stubs are recreated per test by Vitest's `clearMocks: true`, so the auth test file's per-file `vi.mock("next/navigation", …)` continues to take precedence for `auth/state-coverage.test.tsx` and tests that actually assert on `router.push`/`router.replace` calls can do so.

### Q3 — Mock `next/link`, `next/router` (pages router), and `next/headers`?

**Resolved**: **NO. App Router only.**

Rationale: `apps/web/` is exclusively App Router (`app/` directory at the project root, no `pages/` directory). `next/link` is a JSX component, not a hook — testing it requires `<Link>` rendering assertions, not a module-level mock. `next/router` is the pages-router equivalent, not imported anywhere in `apps/web/`. `next/headers` is a server-only API; components client-side never import it. The 3 affected form components import from `next/navigation` only. The fix surface is `next/navigation` alone.

---

## 12. Traceability

Goal → Requirement → Scenario → Test command:

| Goal | Requirements | Scenario | Test command |
|------|-------------|----------|--------------|
| G1 (apps/web suite 0) | R1, R2, R3 (verify), R4 | G1.1 (`pnpm --filter web test`) | `pnpm --filter web test` |
| G2 (state-coverage 25/25) | R1, R2, R4, R5, R11 (no decoration) | G2.1 (state-coverage file) | `pnpm --filter web test state-coverage.test.tsx` |
| G3 (durable mock) | R1, R2 | G3.1 (hypothetical new file) | manual smoke (`pnpm --filter web test foo.test.tsx` for a hypothetical `foo.test.tsx` importing a router-using component) |
| G4 (BDD not regressed) | R6 | G4.1 (BDD suite) | `pnpm turbo run bdd` |
| G5 (no source touched) | R7 | G5.1 (git diff stat) | `git diff --stat develop feat/fix-web-vitest-crash -- <protected paths>` |
| G6 (slice-7 preserved) | R3 (verify), R8 | G6.1 (vitest.config.ts inspect) | `git show feat/fix-web-vitest-crash:apps/web/vitest.config.ts` |

### Acceptance criterion ↔ requirement matrix

| Requirement | Acceptance criterion |
|-------------|----------------------|
| R1 | AC1, AC4 |
| R2 | AC2, AC3 |
| R3 (verify) | AC5, AC6, AC15 |
| R4 | AC7, AC8, AC9 |
| R5 | AC10, AC11 |
| R6 | AC12 |
| R7 | AC13, AC14 |
| R8 | AC6, AC15 |
| R9 | AC4 |
| R10 (PR description) | manual PR review (no binary AC; presence in PR body) |

### Risk ↔ requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (changing `setup.ts` breaks an unrelated test) | R1 factory form is a no-op for tests that don't render Next.js components; R4 verifies exit 0; AC7 catches regressions |
| R2 (vitest hoisting conflicts with per-file mock) | R1 + AC1; per-file `vi.mock` in `auth/state-coverage.test.tsx` re-binds the factory for that file's scope |
| R3 (vitest-4 `poolOptions` deprecation warning) | R8 preserves `pool: "forks"` workaround; out-of-scope ticket for the migration |
| R4 (`useSearchParams` `URLSearchParams` API missing in happy-dom) | R2 factory returns `new URLSearchParams()`; happy-dom 20.10 implements the WHATWG spec at full fidelity |
| R5 (PR confused with the slice-8 PR-2 `auth-server` split red herring) | R10 PR description explicitly references the 4-PR BDD bypass streak and names apps/web vitest as the LAST failing gate |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
- **Explore brief**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
- **Root-cause commit (predates the fix)**: slice-7 PR-7 `36386e1` (introduced the `pool: "forks"` workaround in 2026-07-08; did not address the `useRouter()` root cause)
- **Smoking-gun error**: `invariant expected app router to be mounted` at `next@16.2.10/navigation.ts:179` (next/dist/client/components/navigation.ts in the published package)
- **Pre-existing pattern (to keep)**: per-file `vi.mock("next/navigation", …)` at `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 (the factory-form mock the fix reuses)
- **Vitest config wiring**: `apps/web/vitest.config.ts` line 39 (`setupFiles: ["./__tests__/setup.ts"]`)
- **Slice-7 workaround (predecessor, NOT being removed)**: commit `36386e1`, vitest.config.ts lines 40-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **Slice-8 PR-2 (NOT implicated, false lead)**: commit `2e05fc5` (auth-client.ts / auth-server.ts split) — `import type` is erased at compile time, transparent to vitest workers (explore brief §6)
- **OOM evidence**: explore brief §2 (255s wall time, ~4 GB V8 heap, `FATAL ERROR: Ineffective mark-compacts near heap limit`)
- **Affected components**: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (inside `RowEditMenu`)
- **Regression surface (no new test file)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios across 5 describe blocks)
- **Slice-8 verify report**: Engram `#2278` (confirmed BDD gate is GREEN; the OOM is Gate 3 / unit-tests-only)
- **Project conventions**: AGENTS.md §1 (identity, stack), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — mock lives in exactly one place after this PR), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder specs per orchestrator instruction + `fix-api-nestjs-di` precedent)
- **Proposal-format precedent**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/proposal.md` + `…/spec.md`

---

**Next phase**: `design` (`sdd-design` will produce the exact `vi.mock` factory string, the JSDoc prose, and the diff hunk for `apps/web/__tests__/setup.ts` — translating this WHAT into HOW).
