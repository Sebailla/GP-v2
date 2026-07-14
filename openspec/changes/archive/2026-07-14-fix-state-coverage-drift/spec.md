# Delta Spec — `fix-state-coverage-drift`

> **Change**: `fix-state-coverage-drift` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (post `e0dc2eb`) → tracker `feat/fix-state-coverage-drift` (off develop)
> **Mode**: `auto` · **Artifact store**: hybrid · **Strict TDD**: ACTIVE
> **Date**: 2026-07-14
> **Fix shape (auto decision)**: **A** — nest the harness `messages` constant + adjust 2 assertions (~10 net LOC). Single PR, 1 file, well under the 400-line review budget → `delivery_strategy=auto-chain` is **NOT** triggered.
> **Proposal**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`)
> **Explore brief**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`)
> **Root cause**: next-intl 3.26.5 `resolvePath()` (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`) splits `key` on `.` and walks `messages` per segment. The harness's `messages` is **flat-with-dots** (`"transactions.list": { … }`), so `messages["transactions"]` is `undefined` → resolver throws → `defaultGetMessageFallback` returns the literal dotted path → DOM renders `transactions.list.loading` etc. The production `apps/web/messages/en.json` is correctly nested; only the harness is wrong. Plus 2 secondary assertion failures: `<TransactionsRow>` (TransactionsList.tsx:247-261) renders date/amount/categoryId/currencyCode/kind but **never the `id` field**, so `findByText("txn-1")` and `findByText("txn-2")` cannot find it.

---

## 1. Header

| Field | Value |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-state-coverage-drift` (cut from `develop@e0dc2eb`) |
| Date | 2026-07-14 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Proposal Engram `#2373`; Explore Engram `#2372`; slice-8 verify Gate 3 |
| Fix shape | A (auto decision captured in proposal §3) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | `auto-chain` (>400 LOC auto-chains) — **N/A this change**; ~10 net LOC stays single-PR |
| Strict TDD | ACTIVE (RED already captured by `pnpm --filter web test` exit-1) |

---

## 2. Intent

After `fix-web-vitest-crash` (PR #66, merged on `develop`) closed the V8 OOM via the hoisted `vi.mock("next/navigation", …)`, the apps/web vitest suite is GREEN at the runner level but `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` still reports **13 of 25 scenarios failing**: 11 are caused by the harness's `messages` constant at `apps/web/__tests__/components/transactions/state-coverage.test.tsx:73-188` being shaped **flat-with-dots** (`"transactions.list": { empty: "No transactions yet.", … }`) instead of **nested-objects** (`{ transactions: { list: { empty: "No transactions yet." } } }`). next-intl 3.26.5 / use-intl 3.26.5 `resolvePath()` splits the requested key on `.` and walks `messages` per segment; with flat keys, every segment after the first is `undefined`, the resolver throws, and `defaultGetMessageFallback` returns the literal dotted path (`use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66`). The DOM therefore renders `transactions.list.loading`, `transactions.list.filter.apply`, `auth.sessions.empty`, etc. — none of which match the test's user-visible English assertions. The 11 i18n-shape failures break #1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13 from explore brief §1.1. The remaining 2 failures (#2, #3) are a separate secondary issue: `<TransactionsRow>` (TransactionsList.tsx:247-261) renders `date / amount / categoryId / currencyCode / kind` but **never the `id` field**, so `findByText("txn-1")` and `findByText("txn-2")` cannot succeed even after the messages fix. The verified fix (Shape A): nest the harness `messages` constant into nested-objects so next-intl's `resolvePath` walks it, AND adjust the 2 row assertions to look for content the row actually renders (`cat-1` is the recommended value per explore brief §3.4 — unique per row in the test fixture, less collision-prone than `100.00` or `USD`). Blast radius: 1 file edited, ~10 net LOC, no component source touched, no dependency version changed, no new tests, no `.skip` / `.todo` decorations.

---

## 3. Goals

### G1 — Focused state-coverage command exits 0 with 25/25 passing

`pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` MUST exit 0 with `Tests 25 passed (25)` after the fix. The 13 currently-failing scenarios flip from RED to GREEN while the 12 already-passing scenarios stay GREEN. No `.skip` / `.todo` / `.xfail` decorator may be added to any of the 25 scenarios as a workaround.

### G2 — All 13 previously-failing tests now pass

All 13 of the previously-failing scenarios MUST pass: the 11 i18n-shape failures (`#1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13` from explore brief §1.1) close via the messages nesting; the 2 row-id assertion failures (`#2, #3`) close via adjusted assertions that look for row-rendered content. Zero tests MUST fail in the state-coverage file after the fix.

### G3 — The 12 previously-passing tests remain green

All 12 of the scenarios that already pass on `develop@e0dc2eb` MUST continue to pass after the fix. The harness edits (nesting `messages`, adjusting 2 assertions) MUST NOT introduce any new failure into the suite.

### G4 — Full apps/web suite exits 0 with 145/145 passing

`pnpm --filter web test` MUST exit 0 with `Tests 145 passed (145)`. This is the slice-8 verify Gate 3 number; `fix-web-vitest-crash` got the runner to exit 0 in principle but the 13 failing scenarios in this single file still bring the global count down. After this fix the apps/web unit-test gate closes.

### G5 — BDD gate is not regressed

`pnpm turbo run bdd` MUST continue to exit 0 with **43/43 scenarios** after the fix. The BDD gate was GREEN on `develop@e0dc2eb` per the slice-8 verify report; this fix is apps/web-vitest-only and MUST NOT touch any Cucumber feature file, step definition, or workspace-port from the BDD harness.

### G6 — No component source file is modified

No file under `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, or `libs/**` may be modified by this PR. `git diff --stat develop feat/fix-state-coverage-drift` filtered by the union of those paths MUST be empty. The fix is test-harness-only: the only files in the PR diff are `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (+25 / -15) plus the SDD artifacts under `openspec/changes/fix-state-coverage-drift/`.

---

## 4. Non-Goals

The following are explicitly **out of scope** for this change (mirrored from proposal §2 + AGENTS.md §11):

1. Modifying `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager`, or `SessionList` source code — components are spec-compliant; the harness was wrong-shaped.
2. Adding an `<span data-testid="tx-id">{tx.id}</span>` or any visible id column to `<TransactionsRow>` — the test should assert on row-rendered content, not on a hidden DOM hook.
3. Changing `apps/web/messages/en.json` or `apps/web/messages/es.json` — production messages are already correctly nested; only the harness is wrong.
4. Upgrading or downgrading next-intl / use-intl — version stays at 3.26.5.
5. Mocking `@/lib/transactions-api` differently or restructuring `vi.mock` calls — the existing per-file mock is sound.
6. Adding new tests or `.skip` / `.todo` / `.xfail` decorations to any of the 25 scenarios.
7. Adding a new ESLint rule to `tools/eslint-plugin-boundary/` (e.g., for nested-objects shape).
8. Exporting `messages` for reuse across test files — deferred.
9. Authoring an ADR under `docs/architecture/decisions/` for the nested-objects contract — JSDoc comment in the harness is sufficient per proposal Q1 resolution.
10. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — fix is apps/web-only.
11. Anything in AGENTS.md §11.
12. A Spanish mirror of `spec.md` — per orchestrator instruction + the `fix-web-vitest-crash` and `fix-api-nestjs-di` precedents, the change-folder spec is a coordination artifact between SDD phases; the mirror rule fires for `.md` files under `docs/` that ship as the source of truth, not for change-folder spec drafts.

---

## 5. Functional Requirements

> Keywords per RFC 2119. MUST = absolute requirement. SHOULD = recommended but not blocking. MAY = optional.

### R1 — The harness `messages` constant is reshaped from flat-with-dots to nested-objects

The `messages` constant at `apps/web/__tests__/components/transactions/state-coverage.test.tsx:73-188` MUST be reshaped so that every key path that next-intl's `resolvePath()` walks is reachable by stepping through nested objects. Specifically:

- `"transactions.list": { … }` MUST become `transactions: { list: { … } }`.
- `"transactions.totals": { … }` MUST become `transactions: { totals: { … } }` (merged into the same `transactions` parent).
- `"transactions.new": { … }`, `"transactions.edit": { … }`, `"transactions.detail": { … }`, `"transactions.delete": { … }`, `"transactions.actions": { … }`, `"transactions.threshold": { … }` MUST each become `transactions: { new: { … }, edit: { … }, detail: { … }, delete: { … }, actions: { … }, threshold: { … } }` (all merged under the single `transactions` parent).
- `"categories.list": { … }`, `"categories.form": { … }`, `"categories.delete": { … }`, `"categories.kinds": { … }` MUST each become `categories: { list: { … }, form: { … }, delete: { … }, kinds: { … } }` (merged under the single `categories` parent).
- `"auth.sessions": { … }` MUST become `auth: { sessions: { … } }`.
- `common: { … }` MUST remain unchanged (it was already correctly nested on `develop@e0dc2eb`).

The leaf message **strings** MUST remain identical to the strings on `develop@e0dc2eb` (e.g. `empty: "No transactions yet."`, `submit: "Create"`, `submit: "Save"`, `loading: "Loading..."`, `empty: "No active sessions."`, `name: "Food"`). Only the wrapping hierarchy changes.

### R2 — All 11 i18n-related failures close after the messages reshape

After applying R1, all 11 i18n-shape failures MUST close:

- `TransactionsList > success-empty: shows the empty-state copy` MUST pass (asserts `findByText(/No transactions yet/i)`).
- `CreateTransactionForm > loading: shows the categories-loading copy` MUST pass (asserts `getByText(/Loading/i)` exactly once).
- `CreateTransactionForm > success: creates the transaction (mocked)` MUST pass (asserts `getByRole("button", {name: /create/i})`, `userEvent.click(submit)`, and `expect(createTransaction).toHaveBeenCalled()`).
- `EditTransactionForm > loading: shows the loading copy` MUST pass.
- `EditTransactionForm > validation-error: clearing amount surfaces Zod` MUST pass (asserts `getByRole("button", {name: /save/i})`).
- `CategoryManager > loading: shows the loading copy` MUST pass.
- `CategoryManager > success: shows the category rows` MUST pass (asserts `findByText("Food")`).
- `CategoryManager > validation-error: empty form submit shows a Zod error` MUST pass.
- `SessionList > loading: shows the loading copy` MUST pass.
- `SessionList > empty: shows the empty copy` MUST pass (asserts `findByText(/No active sessions/i)`).
- `SessionList > validation-error: read-only list — no error surfaced` MUST pass (same assertion as the empty case).

The "multiple Loading" symptom that affects 4 of the 11 (#4, #6, #8, #11) MUST disappear once `t("loading")` returns `"Loading..."` instead of the literal dotted key — the regex `/Loading/i` then matches the single `<p>Loading...</p>` element exactly once.

### R3 — The 2 TransactionsRow assertion failures close via adjusted assertions

The 2 row-id assertion failures (`TransactionsList > success-non-empty: shows a row for each item` and `TransactionsList > validation-error: row click surfaces no validation error (it's a read-only list)`) MUST close by replacing the `findByText("txn-1")` / `findByText("txn-2")` assertions with assertions on **row-rendered content** (not on `tx.id`, which `<TransactionsRow>` never renders as visible text).

**Recommended value**: `findByText("cat-1")` (the `categoryId` cell, which is unique per row in the test fixture — `cat-1` appears only in the rows, not in any other text node). Acceptable alternatives if `cat-1` collides: `findByText("USD")` (the currency code) or `findByText("expense")` (the kind). The choice MUST be documented inline with a one-line comment explaining why the assertion changed (`// TransactionsRow renders categoryId/currencyCode/kind/amount/date but not tx.id; assert on the rendered categoryId`).

The fixture data (the `id`, `amount`, `currencyCode`, `kind`, `categoryId`, `occurredAt` fields on the test transaction objects) MUST remain unchanged — only the assertion text changes.

### R4 — `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25/25 passing

The focused vitest command MUST exit 0 and the reporter MUST emit `Tests 25 passed (25)`. This is the binary success signal that G1, G2, G3 all hold simultaneously.

### R5 — `pnpm --filter web test` exits 0 with 145/145 passing

The full apps/web vitest suite MUST exit 0 with `Tests 145 passed (145)`. No test file other than `state-coverage.test.tsx` may be affected; the 18 other test files that were GREEN before this fix MUST remain GREEN. The `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` workaround in `apps/web/vitest.config.ts` (introduced by slice-7 PR-7 commit `36386e1`, preserved by `fix-web-vitest-crash`) MUST remain unchanged — this fix is independent of the OOM workaround.

### R6 — `pnpm turbo run bdd` continues to exit 0 with 43/43 scenarios

The BDD suite MUST continue to exit 0 with 43/43 scenarios. No Cucumber feature file, step definition, world file, or workspace-port may be modified.

### R7 — No component source file is modified

The PR MUST NOT modify any file under `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, or `libs/**`. `git diff --stat develop feat/fix-state-coverage-drift` filtered by the union of those paths MUST be empty. The fix touches exactly one source file: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (+25 / -15). The `apps/web/__tests__/setup.ts` mock introduced by `fix-web-vitest-crash` MUST NOT be modified.

### R8 — The harness `messages` object carries a JSDoc comment explaining the nested-objects contract

The `messages` constant SHOULD be preceded by a JSDoc-style comment block (or a `//` paragraph immediately above the constant) explaining:

1. `next-intl` 3.26.5 `resolvePath()` walks messages by splitting the requested key on `.` and stepping through nested objects per segment.
2. Flat keys with embedded dots (e.g. `"transactions.list": { … }`) cause `messages["transactions"]` to be `undefined`, the resolver throws, and the fallback returns the literal dotted path.
3. The shape MUST mirror the production `apps/web/messages/en.json` tree (which is correctly nested) — every leaf string and every intermediate nesting level must match.
4. Adding a new top-level message namespace in `en.json` requires the harness's `messages` constant to be updated with the same nested-object structure, or the corresponding test scenarios will silently fall back to literal key rendering.

This JSDoc is the documentation for the convention; per proposal Q1 resolution, no separate ADR is authored.

### R9 — The PR description explicitly references PR #66 (`fix-web-vitest-crash`) as the context

The single PR description against `develop` SHOULD include a "Context" section that explicitly references the previous PR #66 (`fix-web-vitest-crash`) as the immediate predecessor and explains why this follow-up matters: PR #66 closed the OOM cascade and brought the apps/web vitest runner back online, but 13 scenarios in this single test file still fail because the harness was written with the wrong message shape. This fix completes the apps/web unit-test gate (slice-8 verify Gate 3) so the slice can finally close.

---

## 6. Scenarios

> Gherkin Given/When/Then format. Every scenario is runnable as an automated test (or a shell greppable check).
>
> 6 scenarios total: one per goal G1–G6.

### G1 scenario (state-coverage 25/25)

#### Scenario: All 25 state-coverage scenarios pass

- GIVEN the harness's `messages` constant at `apps/web/__tests__/components/transactions/state-coverage.test.tsx` is reshaped to nested-objects per R1
- AND the 2 row assertions are adjusted per R3 to look for rendered row content (e.g. `cat-1`)
- WHEN `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` is run from the repo root on `feat/fix-state-coverage-drift`
- THEN the exit code MUST be 0
- AND 25 of 25 scenarios MUST pass (5 TransactionsList + 5 CreateTransactionForm + 5 EditTransactionForm + 5 CategoryManager + 5 SessionList)
- AND no `.skip` / `.todo` / `.xfail` decorator may have been added to any scenario

### G2 scenario (13 previously-failing close)

#### Scenario: All 13 previously-failing tests now pass

- GIVEN the harness edits from R1 (messages nesting) and R3 (row assertions) have been applied
- WHEN the state-coverage test file runs
- THEN 0 tests MUST fail
- AND the 11 i18n-related tests (from explore brief §1.1: #1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13) MUST pass with their original assertion text
- AND the 2 TransactionsRow assertion tests (#2, #3) MUST pass with the adjusted assertions from R3

### G3 scenario (12 previously-passing stay green)

#### Scenario: The 12 previously-passing tests continue to pass

- GIVEN the harness edits from R1 (messages nesting) and R3 (row assertions) have been applied
- WHEN the state-coverage test file runs
- THEN 12 of the originally-passing scenarios MUST continue to pass
- AND no new failure may have been introduced by the harness edits

### G4 scenario (full apps/web suite)

#### Scenario: Full apps/web suite exits 0

- GIVEN the harness edits from R1 (messages nesting) and R3 (row assertions) have been applied
- - AND `apps/web/__tests__/setup.ts` continues to hoist `vi.mock("next/navigation", …)` (introduced by `fix-web-vitest-crash`, MUST be unchanged)
- WHEN `pnpm --filter web test` is run from the repo root on `feat/fix-state-coverage-drift`
- THEN the exit code MUST be 0
- AND the vitest reporter MUST emit `Tests 145 passed (145)`
- AND no `Worker exited unexpectedly` and no `FATAL ERROR: Ineffective mark-compacts near heap limit` may appear in stderr (the slice-7 PR-7 OOM cascade MUST stay fixed)

### G5 scenario (BDD not regressed)

#### Scenario: BDD suite still passes

- GIVEN the apps/web vitest fix from R1, R3, R4 has been applied
- WHEN `pnpm turbo run bdd` is run from the repo root on `feat/fix-state-coverage-drift`
- THEN 43 of 43 BDD scenarios MUST pass
- AND the exit code MUST be 0
- AND no Cucumber feature file, step definition, or world file may appear in `git diff --stat develop feat/fix-state-coverage-drift`

### G6 scenario (no component source touched)

#### Scenario: No source file modifications

- GIVEN the PR diff between `feat/fix-state-coverage-drift` and `develop` is computed
- WHEN the diff is filtered by `apps/web/components/.*\.tsx$|apps/web/lib/.*\.ts$|apps/web/app/.*\.tsx$|apps/api/.*\.ts$|libs/.*\.ts$`
- THEN the filtered file list MUST be empty
- AND the only changed files MUST be `apps/web/__tests__/components/transactions/state-coverage.test.tsx` plus the SDD artifacts under `openspec/changes/fix-state-coverage-drift/`

---

## 7. Constraint Surface

### 7.1 Architectural boundaries (AGENTS.md §7 — enforced by ESLint)

- **`no-prisma-outside-core`**: untouched, irrelevant; the fix touches no Prisma code.
- **`no-schemas-outside-shared`**: untouched, irrelevant; the fix touches no Zod schemas.
- **`no-client-server-import`**: untouched; the harness is test code.
- **`no-cross-module-import`**: untouched, irrelevant; no feature module imports change.
- **`no-mojibake-in-docs`**: untouched. This spec lives under `openspec/changes/` and is a coordination artifact (per orchestrator instruction + AGENTS.md §13 exception precedent: change-folder specs are not mirrored).
- **`no-import-type-injectable`** (introduced by `fix-api-nestjs-di`): not implicated; the harness is in `apps/web/__tests__/`, not in a `*.controller.ts` or `*.service.ts`.

The boundary plugin does NOT gain a new rule for this fix — the nested-objects contract is enforced by the test itself (R1 + R2 + G1/G2) rather than by a lint rule. A future ESLint rule could be added as a follow-up, but it is out of scope per AGENTS.md §11.

### 7.2 Strict TDD (AGENTS.md §4)

The fix follows **RED → GREEN → TRIANGULATE → REFACTOR** order. The RED is already captured by `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exit-1 (13/25 failing). The GREEN lands when the same command exits 0 with 25/25. The TRIANGULATE step is implicit: the 12 originally-passing tests serve as the triangulation evidence that the messages-shape edit does not regress unrelated scenarios. The REFACTOR step (the JSDoc comment from R8) is optional but recommended.

| Step | Order | Test first? | Production code first? |
|------|-------|-------------|------------------------|
| 1 | RED is observed (existing) | `pnpm --filter web test state-coverage.test.tsx` exits 1, 13 fail | no |
| 2 | Edit harness: nest `messages`, adjust 2 row assertions | already RED via step 1 | YES (GREEN: exit 0, 25/25) |
| 3 | Verify full pipeline (`pnpm --filter web test`, `pnpm turbo run bdd`, `pnpm turbo run lint typecheck`) | n/a | n/a |
| 4 | Optional: add JSDoc paragraph per R8 | n/a | YES (REFACTOR) |
| 5 | PR review | n/a | n/a |

### 7.3 Atomic commits (AGENTS.md §5) and Conventional Commits (AGENTS.md §6)

- This change is small enough for a single commit: `fix(test): align state-coverage harness messages to next-intl nested-objects contract`.
- Alternative acceptable subject: `test(web): nest state-coverage messages to fix 13 i18n resolution failures`.
- No "Co-Authored-By" / no AI attribution in the commit message.
- Type vocabulary: `fix`, `test`, `chore`, `docs`, `refactor`.
- Subject ≤72 chars, imperative, no trailing period.
- Body explains WHY (next-intl 3.26.5 resolvePath requires nested objects; the 13 failures were all i18n-shape drift), not WHAT.

### 7.4 Branch model (AGENTS.md §2)

- Work branch: `feat/fix-state-coverage-drift` cut from `develop` (NOT from `main`).
- `main` is immutable; no force-push, no delete, no amend of historic commits.
- `git revert <merge-sha>` cleanly reverses the entire PR.
- The slice-7 chain evidence (`36386e1`, `2e05fc5`) and `fix-web-vitest-crash` (PR #66) MUST be preserved untouched.

### 7.5 Single source of truth (AGENTS.md §8)

- The nested-objects contract for `messages` is defined in exactly one place: the JSDoc comment above the `messages` constant in `state-coverage.test.tsx` (per R8).
- The production `apps/web/messages/en.json` and `apps/web/messages/es.json` remain the source of truth for actual message strings; the harness's `messages` constant MUST mirror those leaf strings.
- The mock setup in `apps/web/__tests__/setup.ts` (introduced by `fix-web-vitest-crash`) remains the single source of truth for the `next/navigation` mock; this fix MUST NOT add a competing mock.

### 7.6 Spanish mirror (AGENTS.md §13)

- This `spec.md` is intentionally NOT mirrored at spec-creation time. Per orchestrator instruction + the `fix-web-vitest-crash` and `fix-api-nestjs-di` precedents (`openspec/changes/archive/2026-07-13-fix-api-nestjs-di/spec.md` was likewise not mirrored), the change-folder spec is a coordination artifact between SDD phases. The mirror rule fires for `.md` files under `docs/` that ship as the source of truth. This change introduces none.

---

## 8. Test Plan

| Goal | Test command | Expected outcome |
|------|--------------|------------------|
| G1 (state-coverage 25/25) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS |
| G2 (13 previously-failing close) | same as G1 + `grep` for the 13 specific test names | exit 0; all 13 scenario names appear with `✓` markers |
| G3 (12 stay green) | same as G1 | exit 0; 12 originally-passing scenarios still `✓` |
| G4 (full apps/web suite) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; no OOM |
| G5 (BDD not regressed) | `pnpm turbo run bdd` | exit 0; 43/43 scenarios continue to pass |
| G6 (no source touched) | `git diff --stat develop feat/fix-state-coverage-drift` filtered by the protected paths | filtered list is empty |

### Manual / non-CI verification steps

- `pnpm --filter web test --reporter=verbose apps/web/__tests__/components/transactions/state-coverage.test.tsx` to enumerate each of the 25 scenarios and confirm no `.skip` / `.todo` decoration.
- `grep -c '\.skip\|\.todo\|\.xfail' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — MUST equal the count on `develop@e0dc2eb` (no new decorations).
- `grep -n '"transactions\.\|"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — MUST return zero hits (proves all flat dotted keys are gone).
- `grep -n 'findByText("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — MUST return zero hits (proves the row-id assertions were adjusted).
- `git log --oneline develop..feat/fix-state-coverage-drift` to confirm a single work-unit commit (subject ≤72 chars, no "Co-Authored-By").
- `git show feat/fix-state-coverage-drift -- apps/web/components apps/web/lib apps/web/app apps/api libs` to confirm no source-file modifications.
- Read the JSDoc paragraph above `messages` (per R8) to confirm it explains the nested-objects contract.

---

## 9. Acceptance Criteria

> Binary pass/fail conditions for `sdd-verify`. Every criterion is testable from a fresh `git checkout feat/fix-state-coverage-drift && pnpm install`.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| AC1 | `messages` is nested-objects shaped | `grep -n '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns zero hits |
| AC2 | All 13 message trees are merged under `transactions` / `categories` / `auth` parents | `grep -nE "^  (transactions\|categories\|auth\|common): \{$" apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns ≥4 hits |
| AC3 | Leaf strings unchanged | `grep -E '"No transactions yet\.\|empty: "No active sessions\.\|submit: "Create"\|submit: "Save"\|loading: "Loading\.\.\."\|name: "Food"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns the same hits as on `develop@e0dc2eb` |
| AC4 | Row-id assertions replaced | `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns zero hits |
| AC5 | JSDoc paragraph explains the contract (R8) | the file MUST contain prose explaining next-intl's `resolvePath` requirement and the failure mode of flat-with-dots keys |
| AC6 | State-coverage file exits 0 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0; reporter emits 25 PASS / 0 FAIL |
| AC7 | Full apps/web suite exits 0 | `pnpm --filter web test` exits 0; `Tests 145 passed (145)` |
| AC8 | No OOM in stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` exits 1 (no match) |
| AC9 | BDD gate still passes | `pnpm turbo run bdd` exits 0; 43/43 scenarios continue to pass |
| AC10 | No source file touched | `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` returns empty |
| AC11 | Only `state-coverage.test.tsx` is edited under `apps/web/` | `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` returns exactly one `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (plus possibly change-folder SDD artifacts under `openspec/changes/fix-state-coverage-drift/`) |
| AC12 | `setup.ts` mock from PR #66 preserved | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit (unchanged from `develop@e0dc2eb`) |
| AC13 | `pool: "forks"` workaround preserved | `grep -n 'pool: "forks"' apps/web/vitest.config.ts` returns 1 hit (unchanged from `develop@e0dc2eb`) |
| AC14 | No `.skip` / `.todo` decoration added | `grep -cE "\\.(skip\|todo)\\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` equals the count on `develop@e0dc2eb` |
| AC15 | No "Co-Authored-By" in any commit | `git log feat/fix-state-coverage-drift --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC16 | Commit subject is Conventional + ≤72 chars | `git log -1 feat/fix-state-coverage-drift --pretty=format:"%s"` matches `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` and is ≤72 chars |
| AC17 | PR base branch is `develop` | the PR's `base` ref is `develop` (NOT `main`) |
| AC18 | Single PR, no force-push | the merge is a single squash or merge commit; `git log develop..feat/fix-state-coverage-drift --merges` returns ≤1 commit; no history rewrite |
| AC19 | PR description references PR #66 | the PR body MUST contain a "Context" section explicitly naming `fix-web-vitest-crash` as the immediate predecessor |
| AC20 | Net LOC delta is bounded | `git diff --shortstat develop..feat/fix-state-coverage-drift -- 'apps/web/__tests__/components/transactions/state-coverage.test.tsx'` shows ≤+30 / ≤-20 lines (matches proposal §4 estimate of ~10 net) |

---

## 10. Out of Scope

(Mirrored from proposal §2 + AGENTS.md §11; non-goals above are operational, this section is the formal review check.)

1. Anything in AGENTS.md §11.
2. Modifying `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager`, or `SessionList` source code.
3. Adding a hidden `<span data-testid="tx-id">` or visible id column to `<TransactionsRow>`.
4. Changing `apps/web/messages/en.json` or `apps/web/messages/es.json`.
5. Upgrading or downgrading next-intl / use-intl.
6. Restructuring `vi.mock("@/lib/transactions-api", …)` at `state-coverage.test.tsx:39-54`.
7. Adding new tests or `.skip` / `.todo` / `.xfail` decorations to any of the 25 scenarios.
8. Adding a new ESLint rule to `tools/eslint-plugin-boundary/` for nested-objects shape.
9. Exporting `messages` for reuse across test files.
10. Authoring an ADR under `docs/architecture/decisions/` (JSDoc in the harness is the documentation per Q1).
11. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/`.
12. Migration of `gastos-personales/` to the vertical-slicing model.
13. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI.
14. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
15. Amending, rebasing, or removing commits `36386e1` (slice-7 PR-7 workaround), `2e05fc5` (slice-8 PR-2 auth split), or any commit of `fix-web-vitest-crash` (PR #66).
16. Touching `apps/web/__tests__/setup.ts` (the PR #66 hoisted mock stays the single source of truth for `next/navigation`).
17. Touching `apps/web/vitest.config.ts` (the slice-7 `pool: "forks"` workaround stays unchanged).
18. A Spanish mirror of any file under `openspec/changes/fix-state-coverage-drift/` (no `.md` source of truth ships in this change).

---

## 11. Open Questions — RESOLVED

The proposal deferred 3 questions to the spec phase. They are now resolved:

### Q1 — Author a new ADR for the nested-objects contract or rely on JSDoc?

**Resolved**: **JSDoc comment block above the `messages` constant (NO new ADR)**.

Rationale: the architectural decision here is essentially "the harness `messages` constant MUST mirror the production `en.json` tree as nested-objects". That is a one-paragraph convention, not a multi-section rationale. A JSDoc comment at the canonical site (the `messages` constant itself) puts the explanation where the future maintainer actually reads code, not in a separate doc that has to be discovered. The slice-1 ESLint-plugin-boundary pattern follows the same "explain at the canonical site" principle, and PR #66 (`fix-web-vitest-crash`) followed the same precedent for its setup.ts mock (JSDoc, no ADR).

### Q2 — Export `messages` for reuse across test files?

**Resolved**: **NO. Keep it file-local.**

Rationale: the only test file that needs this exact `messages` tree is `state-coverage.test.tsx`. Other test files (e.g. `auth/state-coverage.test.tsx`) already have their own per-file `messages` constants tailored to the components they exercise. Extracting to a shared helper would add an import path without saving any lines (each file's messages differ in which namespaces they include), and would couple unrelated test files. Per-file constants keep the harness self-contained.

### Q3 — Use `cat-1` or `100.00` for the row assertions?

**Resolved**: **`cat-1`** (the `categoryId` cell).

Rationale: per explore brief §3.4, `cat-1` is more specific than `100.00` (the amount) because:

- `cat-1` is unique per row in the test fixture (no other text node in the rendered tree contains the literal `cat-1`).
- `100.00` could collide with the `<input>` default value, the `findByDisplayValue("100.00")` assertion in `EditTransactionForm > success`, or any other fixture amount.
- `USD` could collide with the currency-code column if multiple rows were present.
- `expense` could collide with the kind column or the `<option>expense</option>` in the NewCategoryForm Select.

`cat-1` is the lowest-collision, most-specific option. A one-line inline comment (`// TransactionsRow renders categoryId but not tx.id; assert on the rendered categoryId`) documents the choice at the assertion site so future contributors don't undo the change thinking the original `findByText("txn-1")` was the "right" assertion.

---

## 12. Traceability

### Spec requirement → Goals satisfied

| Spec requirement | Goals satisfied |
|------------------|-----------------|
| R1 (messages reshape to nested-objects) | G1, G2 |
| R2 (all 11 i18n-shape failures close) | G2 |
| R3 (2 row assertions adjusted) | G2, G3 |
| R4 (state-coverage file exits 0, 25/25) | G1, G3 |
| R5 (full apps/web suite exits 0, 145/145) | G4 |
| R6 (BDD gate not regressed, 43/43) | G5 |
| R7 (no component source touched) | G6 |
| R8 (JSDoc explains contract) | (documentation; supports G1/G2/G3 by preventing future regressions) |
| R9 (PR description references PR #66) | (PR hygiene; supports all goals by giving reviewers the why-we-cared trail) |

### Acceptance criterion ↔ requirement matrix

| Requirement | Acceptance criterion |
|-------------|----------------------|
| R1 | AC1, AC2, AC3 |
| R2 | AC6 (state-coverage 25/25) |
| R3 | AC4, AC6 |
| R4 | AC6 |
| R5 | AC7, AC8, AC12, AC13 |
| R6 | AC9 |
| R7 | AC10, AC11 |
| R8 | AC5 |
| R9 | AC19 |

### Risk ↔ requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|---------------|
| R1 (a passing test may rely on a literal dotted fallback) | R1 + R2 + AC1 + AC2 + AC6 (no flat-dotted keys remain; the 11 i18n tests close) |
| R2 (row assertions become less specific) | R3 + AC4 + Q3 resolution (use `cat-1`, the most unique-per-row fixture value) + inline comment at the assertion site |
| R3 (multiple-`Loading` collisions may persist due to a stray text node) | R2 + AC6 + AC8 (after nesting, the regex `/Loading/i` matches the single `<p>Loading...</p>` exactly once; if any remain, the apply sub-agent re-investigates per explore brief §3.3) |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`)
- **Explore brief**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`)
- **Predecessor PR**: PR #66 (`fix-web-vitest-crash`) — hoisted `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts`; closed the V8 OOM cascade
- **Smoking-gun code path**: `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` (`resolvePath` walks messages per dot-separated segment) and `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` (`defaultGetMessageFallback` returns the literal dotted path)
- **Production reference (correctly nested)**: `apps/web/messages/en.json` — the production message tree, correctly nested; the harness's flat-with-dots shape is the only place in the repo using the wrong shape
- **Affected components (NOT modified)**: `apps/web/components/transactions/TransactionsList.tsx:247-261` (`<TransactionsRow>` renders date/amount/categoryId/currencyCode/kind but never `id`); `apps/web/components/transactions/CreateTransactionForm.tsx:166-250`; `apps/web/components/transactions/EditTransactionForm.tsx:179-266`; `apps/web/components/transactions/CategoryManager.tsx:95-118`; `apps/web/components/auth/SessionList.tsx:113-153`
- **Regression surface (the file being edited)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios across 5 describe blocks)
- **Setup mock (preserved from PR #66)**: `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`)
- **Vitest config (preserved from slice-7 PR-7)**: `apps/web/vitest.config.ts` lines 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`, commit `36386e1`)
- **Project conventions**: AGENTS.md §1 (identity, stack), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — nested-objects contract enforced at the canonical site), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder specs per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` precedents)
- **Proposal-format precedents**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/{proposal,spec}.md` and `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/{proposal,spec}.md`

---

**Next phase**: `design` (`sdd-design` will produce the exact nested-object message tree, the inline comment text for the 2 adjusted row assertions, and the diff hunk for `state-coverage.test.tsx` — translating this WHAT into HOW).