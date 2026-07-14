# Proposal — `fix-web-vitest-crash`

> **Status**: draft · proposal phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `d9fdfec`) → tracker `feat/fix-web-vitest-crash`
> **Artifact store**: hybrid · **Mode**: auto (interactive question round SKIPPED — small change, intent + root cause already pinned in explore brief)
> **Fix shape (auto decision)**: **B** — hoist the `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts` (durable for future test files). Single PR, 1 file, ~8 net LOC, well under the 400-line review budget.

---

## 1. Intent

Slice 8 (`slice-8-closing-bdd-and-docs`) verify Gate 3 reports **apps/web unit tests fail**: `pnpm --filter web test` exits 1 after ~255 seconds (4m 15s) with `Tests 120 passed (145)` + `Worker exited unexpectedly` + V8 heap `~4073 MB` + `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed`. The root cause is verified empirically (not hypothesised): the test file `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios across 5 describe blocks) does NOT mock `next/navigation`, so when it renders `TransactionsList` (via `RowEditMenu`), `CreateTransactionForm`, and `EditTransactionForm` — all three call `useRouter()` from `next/navigation` — Next.js 16 throws `invariant expected app router to be mounted` (smoking gun: `next@16.2.10/navigation.ts:179`). 15/25 scenarios throw. React 19's concurrent-mode partial-fiber commit keeps the partial render in the tree, the suite's `new Promise(() => {})` mocks (loading states) keep `useEffect` chains unresolved, fibers accumulate per test, V8 heap grows to ~4 GB, worker is OOM-killed. Slice-7 PR-7's `pool: "forks"` + `singleFork: true` workaround (commit `36386e1`) only changed *when* the OOM fires, not *whether* — it does not address the root cause. The same `vi.mock("next/navigation", …)` pattern already exists in `apps/web/__tests__/components/auth/state-coverage.test.tsx` (lines 47-49) for the auth forms — a per-file mock that brittly depends on every new test file remembering the boilerplate. The verified fix: hoist that same mock to `apps/web/__tests__/setup.ts`, which is loaded by ALL 18 test files in the suite (`vitest.config.ts` line 39 already wires it via `setupFiles: ["./__tests__/setup.ts"]`). After the fix: all 145 apps/web tests pass, wall time drops from 255s → <10s, no OOM, no deprecation banner. Blast radius: 1 file edited, 18 test files silently protected against the same OOM cascade on any future router-using component.

---

## 2. Scope

### 2.1 In Scope

1. `apps/web/__tests__/setup.ts` — add a `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }))` block (mirroring the auth state-coverage pattern at lines 47-49). Place AFTER the `@testing-library/jest-dom/vitest` import, BEFORE any local declarations. Add a JSDoc paragraph explaining the invariant ("happy-dom does not mount the Next.js app router; components that call `useRouter()` throw at render time unless we stub it here"). Use the factory-function form so the mock is hoisted by Vitest's transform before any module is imported.
2. `apps/web/vitest.config.ts` — **verify only, no edit**. The `setupFiles: ["./__tests__/setup.ts"]` entry (line 39) is already correct; the mock lands there automatically via the existing wiring. Confirm in code review.
3. Engram observation at `topic_key sdd/fix-web-vitest-crash/proposal`, `type=architecture`, `project=gp-v2`, `scope=project`, `capture_prompt=false` persists the proposal in the hybrid artifact store (mirrors the filesystem write per the hybrid contract in `skills/_shared/sdd-phase-common.md`).

### 2.2 Out of Scope

- The 2 minor sub-failures in `apps/web/__tests__/components/transactions/state-coverage.test.tsx` SessionList scenarios (`findByText(/500/i)` matches `'500 '` with a trailing space because the mocked `Response` has no `statusText`) — separate ticket. They are independent of the OOM crash; one test throws the invariant, the other two fail on the trailing-space regex; the 10 scenarios that already pass include the loading scenario which was leaking the heap.
- The vitest-4 `test.poolOptions` deprecation warning ("`test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options") — separate ticket. Will become an error in vitest 5. Project is on vitest 4.1.9. The slice-7 PR-7 workaround (commit `36386e1`, `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) stays untouched; this fix is additive, not a replacement.
- Any vitest version upgrade (4.1.9 → v5 or similar).
- Any new test code (RED is already the existing `state-coverage.test.tsx` exit-1; no new test file needed).
- Any change to the 3 form components (`apps/web/components/transactions/TransactionsList.tsx`, `CreateTransactionForm.tsx`, `EditTransactionForm.tsx`) or any other source code in `apps/web/components/`, `apps/web/lib/`, or `apps/web/app/`.
- Migration of the per-file `vi.mock("next/navigation", …)` in `apps/web/__tests__/components/auth/state-coverage.test.tsx` to a no-op (the global mock makes the local one redundant, but removing it is a follow-up cleanup — keeps this PR focused on the OOM fix).
- Mocking `next/link`, `next/router` (pages router), or `next/headers` — apps/web uses App Router exclusively; none of the affected components import these.
- New ADR (`docs/architecture/decisions/`) — the JSDoc paragraph in `setup.ts` is the documentation; no architectural decision beyond "mock the router in setup" is being made.
- Coverage gate enforcement (declared out of scope per AGENTS.md §11).
- Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — the fix is apps/web-only.
- Migration of the `gastos-personales/` parent repo to the vertical-slicing model (per AGENTS.md §11).
- i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
- No Spanish mirror of the proposal — per orchestrator instructions (the proposal is a coordination artifact, not a user-facing doc).

---

## 3. Approach

Three steps, ordered strict-TDD style. **No production change lands without the existing RED observed first.**

### Step 1 — RED is already observed (recorded in explore brief §2, §4.2)

`pnpm --filter web test` currently exits 1 with the OOM signature (255s wall time, V8 heap ~4 GB, 25/145 tests failing, 120/145 passing, `Worker exited unexpectedly`). RED captured. No new test file is needed — the existing `state-coverage.test.tsx` is the regression surface, per AGENTS.md §4.

### Step 2 — GREEN the fix: hoist the mock into `setup.ts`

Edit `apps/web/__tests__/setup.ts` (currently 22 lines). After the existing `import "@testing-library/jest-dom/vitest";` line, add:

```ts
import { vi } from "vitest";

// Stub `next/navigation` for the entire apps/web test suite.
//
// happy-dom does not mount the Next.js app router; any component that
// calls `useRouter()`, `usePathname()`, or `useSearchParams()` throws
// `invariant expected app router to be mounted` at render time. The
// slice-7 PR-7 workaround (`pool: "forks"` + `singleFork: true`) only
// changed *when* the worker OOM fires, not *whether*. Without this
// mock, the 15/25 scenarios in `state-coverage.test.tsx` that render
// `TransactionsList`/`CreateTransactionForm`/`EditTransactionForm`
// (each calls `useRouter()`) throw, the partial fiber stays mounted
// across tests, and V8 heap grows to ~4 GB before the worker is
// killed.
//
// Factory form is required: `vi.mock` is hoisted by Vitest's transform
// above all imports, and the factory receives the `vi` object so the
// `vi.fn()` stubs are recreated per test (vitest's `clearMocks: true`
// then resets them automatically).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
```

Why the factory-form `vi.mock` (not `vi.doMock` or `vi.spyOn`):

- `vi.mock` is hoisted by Vitest's transform — the mock applies before any module is imported. `vi.doMock` is NOT hoisted and does not apply to dynamic imports (the `next/navigation` package is loaded by Next.js's barrel indirectly).
- `vi.fn()` returns fresh stubs per test when `clearMocks: true` is set (vitest.config.ts line 38), so tests don't need to manually reset between scenarios.
- The factory returns a plain object (not a class), so React's reconciler treats the value as an opaque router — no symbol-resolution edge cases.

Why `setup.ts` (not the test file itself):

- The auth state-coverage file already has this exact per-file mock (lines 47-49 of `apps/web/__tests__/components/auth/state-coverage.test.tsx`). The pattern is brittle: every new test file that renders a router-using component is one accidental omission away from this same OOM cascade. Hoisting makes the invariant "next/navigation is fake in tests" a global one, not a per-test-file convention.
- The vitest `setupFiles` config (vitest.config.ts line 39) already wires `setup.ts` — no config change needed.

Re-run `pnpm --filter web test`. The 15 currently-throwing scenarios turn GREEN. Wall time drops from 255s → <10s. No OOM.

### Step 3 — Verify

Run `pnpm turbo run test bdd lint typecheck` on the `feat/fix-web-vitest-crash` branch. Apps/web test suite exits 0 with `Tests 145 passed (145)`. The 17 other test files (120 tests) continue to pass — the global mock is a no-op for them (they don't render Next.js components; the `useRouter()` stub is never called). BDD gate stays GREEN (was GREEN on `develop@d9fdfec`; explore brief §1 confirms). `pnpm lint:fixtures` exits 0 (no new ESLint boundary violations). Open the single PR against `develop`.

---

## 4. Capabilities

> Contract between this proposal and `sdd-spec`. Researched `openspec/specs/` first — **the directory does not exist** at the project root (`ls openspec/specs/` → NO SPECS DIR). The project has no persistent capability taxonomy yet; the only spec-bearing artifact is `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` (the original scaffold proposal). Capability naming for `sdd-spec` to invent.

### 4.1 New Capabilities

- `apps-web-test-next-nav-stub`: documents the requirement that ALL test files under `apps/web/__tests__/` may rely on a hoisted `vi.mock("next/navigation", …)` in `setup.ts`, with the factory returning `{ useRouter, usePathname, useSearchParams }` stubs. The capability scope is test-infrastructure-only (no production behaviour change). Will become `openspec/specs/apps-web-test-next-nav-stub/spec.md`.

### 4.2 Modified Capabilities

- None. No existing spec-level behaviour changes. The 3 form components (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) keep their `useRouter()` calls untouched. The auth forms' test file (`apps/web/__tests__/components/auth/state-coverage.test.tsx`) keeps its per-file mock — the global mock in `setup.ts` is additive; the local mock becomes redundant but is removed in a follow-up cleanup (out of scope here, per §2.2).

### 4.3 Architectural-boundary ESLint plugin

- No change. The boundary plugin (`tools/eslint-plugin-boundary/`) does not gain a new rule for this fix — the mock is a test-infra convention, not a code-boundary guard. `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs` remain the 5 active rules.

---

## 5. Affected Areas

| File | Change | LOC delta |
|------|--------|----------:|
| `apps/web/__tests__/setup.ts` | Edit (add hoisted `vi.mock("next/navigation", …)` block + JSDoc comment) | +28 / 0 |
| `apps/web/vitest.config.ts` | Verify (no edit — `setupFiles` entry at line 39 already correct) | 0 / 0 |

**Total estimated**: +28 / 0, ~28 net LOC. Stays well under the 400-line review budget → **single PR is appropriate** (no auto-chain trigger; `delivery_strategy=auto-chain` from the orchestrator's preflight is NOT triggered by this change).

---

## 6. Success Criteria

`sdd-verify` will run these 6 gates.

**Functional (G1–G2)**: G1 — `pnpm --filter web test` exits 0 with `Tests 145 passed (145)`, wall time <30s (down from 255s). G2 — the 15 previously-throwing scenarios in `state-coverage.test.tsx` (5 CreateTransactionForm + 5 EditTransactionForm + 5 TransactionsList) all PASS; the 10 already-passing scenarios (5 CategoryManager + 5 SessionList) continue to PASS (the 2 SessionList `findByText(/500/i)` sub-failures are out of scope per §2.2 and remain a separate ticket).

**Hygiene (G3–G6)**: G3 — no `Worker exited unexpectedly` error in the test output; no `FATAL ERROR: Ineffective mark-compacts near heap limit` in the test output. G4 — `pnpm turbo run test bdd lint typecheck` exits 0 on `feat/fix-web-vitest-crash`; `pnpm turbo run bdd e2e` continues to exit 0 (no BDD regression). G5 — `pnpm lint:fixtures` exits 0; no new ESLint boundary violations. G6 — no changes to any file in `apps/web/components/transactions/`, `apps/web/components/auth/`, `apps/web/lib/`, `apps/web/app/`, `apps/api/`, or `libs/` — verified by `git diff --stat develop feat/fix-web-vitest-crash`.

---

## 7. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | Changing `setup.ts` (read by all 18 test files in `apps/web/__tests__/`) could break an unrelated test that was relying on the absence of a global mock. | Low | The mock is a no-op for tests that don't render Next.js components — the `useRouter()`/`usePathname()`/`useSearchParams()` stubs are never called. The 17 files (120 tests) currently pass without the mock and will continue to pass with it; vitest's `clearMocks: true` resets the stubs per test. If any post-change test fails, the failure mode points at a test that imports `next/navigation` directly (none currently do — the auth forms go through `next/navigation` and they already have a per-file mock that just gets shadowed). |
| R2 | Vitest's hoisting might conflict with the existing per-file `vi.mock("next/navigation", …)` in `apps/web/__tests__/components/auth/state-coverage.test.tsx`. | Low | Per-file `vi.mock` overrides the global one for that file's scope (Vitest applies mocks in import order; the per-file call re-binds the factory). The auth tests continue to pass with the per-file mock in place — verified by the existing 120-test baseline. The per-file mock becomes redundant after this PR but is left intact for the follow-up cleanup (out of scope per §2.2). |
| R3 | The vitest-4 `test.poolOptions` deprecation warning is still present and may become a hard error in vitest 5. | Low | Out of scope per §2.2; separate ticket. The slice-7 PR-7 workaround stays; the `poolOptions` deprecation does not block this fix. |
| R4 | The factory-form mock returns a plain object for `useSearchParams()` (`new URLSearchParams()`) — some components may destructure methods off `URLSearchParams` that don't exist on the happy-dom polyfill. | Low | `URLSearchParams` is a WHATWG spec class implemented in happy-dom at full fidelity. The 3 affected components (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) call `useSearchParams().get("…")` only; `URLSearchParams.get` is present in happy-dom 20.10. Verified by component source (no `.entries()`, `.forEach()`, or `.keys()` usage). |
| R5 | The fix could be mistaken for a "drop the `import type`" exercise (mirroring the `fix-api-nestjs-di` precedent) and re-trigger the slice-8 PR-2 confusion. | Low | The auth split (`auth-client.ts` / `auth-server.ts`) is `import type` (erased at compile time) — explore brief §6 verifies it's transparent to vitest workers. The OOM has nothing to do with the auth split; the commit log (slice-7 PR-7 `36386e1` introduced the workaround pre-PR-2) is the smoking gun. The PR description must cite this explicitly so reviewers don't re-walk the dead end. |

---

## 8. Rollback Plan

**Whole-change**: `git revert <merge-sha>` on `develop` undoes the single PR cleanly. The `setup.ts` edit reverts to its 22-line baseline; `apps/web/vitest.config.ts` is unchanged (no revert needed). The 25 scenarios in `state-coverage.test.tsx` return to their previously-failing state (acceptable because the same tests were already broken on `develop@d9fdfec` — slice-8 verify report confirmed Gate 3 / OOM crash as observation F1 of the slice-7-inheritance debt).

**Per-step rollback**:
- Step 1+2 (setup.ts edit) — revert the file. Tests fail again as before. Vitest config is untouched, so no config revert needed.
- Step 3 (verify) — no rollback needed (no artifact).

**Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, or amend commit `36386e1`. The slice-7 chain evidence (`36386e1`, `2e05fc5`) stays intact.

---

## 9. Dependencies

- `apps/web/vitest.config.ts#setupFiles` (line 39) — preserved as-is; the mock lands there automatically via the existing wiring. No config edit needed.
- `apps/web/__tests__/setup.ts` (existing 22 lines) — preserved structure; the jest-dom import (line 1) and JSDoc paragraph (lines 3-21) stay; the mock block is appended after the import.
- `vitest@4.1.9` `vi.mock` hoisting semantics — re-used as-is; no new dependency.
- `next@16.2.10` `useRouter` / `usePathname` / `useSearchParams` signatures — the factory returns objects with the same shape (verified against `next@16.2.10/navigation.ts`).
- `happy-dom@20.10` `URLSearchParams` implementation — used as-is by the factory's `useSearchParams` stub.
- `apps/web/__tests__/components/auth/state-coverage.test.tsx` (the pattern source) — the per-file mock at lines 47-49 is the template; we re-use the same factory shape with the broader `{ useRouter, usePathname, useSearchParams }` triple (the auth mock returns only `{ replace }`; the transactions forms also call `useRouter().push(...)`, so the factory must return the full router shape).
- OpenSpec change directory `openspec/changes/fix-web-vitest-crash/` already exists with `explore.md` (Engram #2361).

---

## 10. Open Questions for `sdd-spec`

1. **Mock surface area** — should the factory return only `{ useRouter }` (minimal, mirrors the auth state-coverage pattern at lines 47-49) or the full triple `{ useRouter, usePathname, useSearchParams }` (broader coverage for any future test that renders a `<Link>` or reads the URL)? Proposal picks the triple (3 net LOC difference, no downside; happy-dom doesn't ship a `usePathname`/`useSearchParams` polyfill either). Spec phase confirms.
2. **Per-file mock cleanup** — should the redundant per-file `vi.mock("next/navigation", …)` in `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 be removed in this PR, or deferred to a follow-up? Proposal defers (keeps this PR focused on the OOM fix; per-file removal is 1 trivial PR). Spec phase decides.
3. **Slice-7 PR-7 workaround** — should the slice-7 `pool: "forks"` + `singleFork: true` workaround (commit `36386e1`, vitest.config.ts lines 40-63) be removed once the root-cause fix lands? **Recommendation: NO** — the workaround mitigates a separate happy-dom + React 18 timing edge case (the EditTransactionForm mount-then-load-then-setState pattern); the OOM fix targets the `useRouter()` invariant, which is a different failure mode. Both can coexist; removing the workaround risks regressing the slice-7 symptom. Spec phase confirms.

---

## 11. Cross-references

- Explore brief: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram #2361, parent observation).
- Smoking-gun error: `invariant expected app router to be mounted` at `next@16.2.10/navigation.ts:179` (next/dist/client/components/navigation.ts in the published package).
- Existing pattern source: `apps/web/__tests__/components/auth/state-coverage.test.tsx` lines 47-49 (the per-file `vi.mock("next/navigation", …)` block).
- Vitest config wiring: `apps/web/vitest.config.ts` line 39 (`setupFiles: ["./__tests__/setup.ts"]`).
- Slice-7 workaround (predecessor, NOT being removed): commit `36386e1`, vitest.config.ts lines 40-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`).
- Slice-8 PR-2 (NOT implicated, false lead): commit `2e05fc5` (auth-client.ts / auth-server.ts split) — `import type` is erased at compile time, transparent to vitest workers (explore brief §6).
- OOM evidence: explore brief §2 (255s wall time, ~4 GB V8 heap, `FATAL ERROR: Ineffective mark-compacts near heap limit`).
- Affected components: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (inside `RowEditMenu`).
- Slice-8 verify report: Engram #2278 (confirmed BDD gate is GREEN; the OOM is Gate 3 / unit-tests-only).
- Project conventions: AGENTS.md §4 (strict TDD — RED is the existing `pnpm --filter web test` exit-1; no new test file needed), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — `no-client-server-import` is not fired; the mock is at the test boundary), §8 (single source of truth — the mock lives in exactly one place after this PR), §11 (out-of-scope list), §13 (Spanish mirror — N/A, proposal is a coordination artifact per orchestrator instructions).
- Proposal-format precedent: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/proposal.md`.

---

## 12. Next Phase

`next_recommended`: **`spec`**.

`sdd-spec` should:
- Create `openspec/specs/apps-web-test-next-nav-stub/spec.md` capturing the new capability (G1–G6 of §6).
- Resolve Q1 (mock surface area: `useRouter` only vs. triple) explicitly. Proposal picks the triple.
- For Q2 (per-file mock cleanup), defer the removal to a follow-up PR; this change only adds the global mock.
- For Q3 (slice-7 workaround), confirm the workaround stays (precedent: don't change a workaround when the root-cause fix lands; the workaround mitigates a different symptom).

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R5 (see §7).
