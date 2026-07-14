# Technical Design — `fix-web-vitest-crash`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `d9fdfec`) → tracker `feat/fix-web-vitest-crash`
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: `auto-chain` NOT triggered (28 LOC stays single-PR) · **Review budget**: 400 lines
> **Strict TDD**: active (AGENTS.md §4) · **Single PR**: 1 file edited (+28 / 0), 2 atomic commits
> **Fix shape**: B (auto decision captured in proposal §0)
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-14
> **Inputs read**: `proposal.md` (Engram `#2362`, 217 LOC), `spec.md` (Engram `#2363`, 419 LOC, 6 goals, 10 requirements, 6 scenarios, 20 ACs), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (format precedent, 14 sections), `apps/web/__tests__/setup.ts` (current 22 lines), `apps/web/vitest.config.ts` (120 lines; `setupFiles` at L39, `pool: "forks"` workaround at L54-63), `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines; only mock is `@/lib/transactions-api` at L39-54 — no `vi.mock("next/navigation", …)`)
> **Resolution of spec open questions**: Q1 (JSDoc, no new ADR), Q2 (full router shape `{ push, replace, back, forward, refresh, prefetch }`), Q3 (App Router only — no `next/link`/`next/router`/`next/headers` mocks) — ALL resolved in spec; this design does not re-litigate them.

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — `apps/web` vitest exits 0 with 145/145 passing | §3 G1, R1, R2, R3, R4 | Hoist `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts` (loaded by all 18 test files via `setupFiles` at `apps/web/vitest.config.ts:39`). The factory returns stubbed `useRouter`, `usePathname`, `useSearchParams`, `useParams`. The 15 throwing scenarios in `state-coverage.test.tsx` now find a fake router at render time; the 10 already-passing scenarios are unaffected. Wall time drops 255s → <30s; heap stays under 1 GB. |
| **G2** — state-coverage 25/25 passes | §3 G2, R5 | Same hoist. The 15 scenarios that called `useRouter()` from `TransactionsList`/`CreateTransactionForm`/`EditTransactionForm` and threw `invariant expected app router to be mounted` (`next@16.2.10/navigation.ts:179`) now resolve the hook against the stub and proceed. The 10 already-passing scenarios (CategoryManager + 5 SessionList) stay GREEN. The 2 SessionList `findByText(/500/i)` sub-failures remain out of scope per proposal §2.2 (separate ticket, not the OOM root cause). |
| **G3** — mock is durable | §3 G3 | The mock lives at the suite's single setup entry. Every test file under `apps/web/__tests__/` (the existing 18 + any future file) gets the fake router automatically. Per-file boilerplate (currently the auth state-coverage's redundant per-file mock at L47-49) becomes optional, not required. |
| **G4** — BDD not regressed | §3 G4, R6 | No changes to `libs/features/*/docs/*.feature`, step definitions, world files, or workspace-ports. The BDD gate stays GREEN (was GREEN on `develop@d9fdfec` per slice-8 verify report Engram `#2278`). |
| **G5** — no component source touched | §3 G5, R7 | Only `apps/web/__tests__/setup.ts` is edited. The `git diff --stat` filtered by `apps/web/components/\|apps/web/lib/\|apps/web/app/\|apps/api/\|libs/` MUST be empty (AC13). |
| **G6** — slice-7 workaround preserved | §3 G6, R8 | `apps/web/vitest.config.ts` lines 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` + the `@ts-expect-error` comment) MUST remain unchanged. The workaround mitigates a DIFFERENT failure mode (React 18 `useEffect`-driven state-update edge case in `EditTransactionForm`'s mount-then-load-then-setState pattern); the OOM fix targets the `useRouter()` invariant. Both coexist. |

---

## 2. File-by-file diffs

### File 1 — `apps/web/__tests__/setup.ts` (EDIT, +28 / -0)

**Current state** (22 lines):

```typescript
import "@testing-library/jest-dom/vitest";

/**
 * Vitest setupFiles hook for `apps/web` — slice 4 batch 4b.
 *
 * Imports `@testing-library/jest-dom/vitest` so the custom matchers
 * (`toBeInTheDocument`, `toHaveAttribute`, etc.) extend `expect` and
 * resolve at test-execution time. The matchers are TypeScript-aware
 * (the `/vitest` subpath exposes the `Assertion<...>` type extension).
 *
 * Why a separate file instead of importing in each test:
 *  - Single declaration site (DRY).
 *  - Per-test imports re-extend the Assertion type and clutter the
 *    test file headers.
 *  - The vitest `setupFiles` config runs the import BEFORE any test
 *    module loads so the matchers are available globally.
 *
 * No other setup is required for slice 4 batch 4b — the shadcn-style
 * primitives are pure React components with no I/O, no fetch, no DOM
 * mutation outside the render tree. happy-dom provides a DOM, the
 * matchers add the assertion surface, and the tests run.
 */
```

**Final state** (28 net LOC added — `vi.mock` block + JSDoc paragraph above it, placed AFTER the existing JSDoc paragraph):

```typescript
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * Vitest setupFiles hook for `apps/web` — slice 4 batch 4b.
 *
 * Imports `@testing-library/jest-dom/vitest` so the custom matchers
 * (`toBeInTheDocument`, `toHaveAttribute`, etc.) extend `expect` and
 * resolve at test-execution time. The matchers are TypeScript-aware
 * (the `/vitest` subpath exposes the `Assertion<...>` type extension).
 *
 * Why a separate file instead of importing in each test:
 *  - Single declaration site (DRY).
 *  - Per-test imports re-extend the Assertion type and clutter the
 *    test file headers.
 *  - The vitest `setupFiles` config runs the import BEFORE any test
 *    module loads so the matchers are available globally.
 *
 * `next/navigation` is mocked globally (slice 8 — fix-web-vitest-crash)
 * because happy-dom does not mount the Next.js app router. Any component
 * that calls `useRouter()`, `usePathname()`, `useSearchParams()`, or
 * `useParams()` throws `invariant expected app router to be mounted`
 * (`next@16.2.10/navigation.ts:179`) at render time without this stub.
 * Without the stub, the 15/25 scenarios in
 * `apps/web/__tests__/components/transactions/state-coverage.test.tsx`
 * that render `TransactionsList` (via `RowEditMenu`),
 * `CreateTransactionForm`, or `EditTransactionForm` throw at render,
 * the partial fiber stays mounted across tests, and V8 heap grows to
 * ~4 GB before the worker is OOM-killed after ~4 minutes (slice-8
 * verify Gate 3, Engram `#2278`).
 *
 * Slice 7 PR-7 (`36386e1`) added `pool: "forks"` +
 * `singleFork: true` to `apps/web/vitest.config.ts` (lines 54-63).
 * That workaround changed WHEN the worker OOM fires, not WHETHER —
 * it does NOT address the `useRouter()` invariant. This global mock
 * is the root-cause fix; both coexist.
 *
 * The mock lives at the suite's single setup entry so every test
 * file under `apps/web/__tests__/` (the existing 18 + any future
 * file) gets the fake router automatically. The per-file mock at
 * `apps/web/__tests__/components/auth/state-coverage.test.tsx`
 * L47-49 becomes redundant but stays untouched in this PR (follow-up
 * cleanup). See `openspec/changes/fix-web-vitest-crash/{proposal,spec,design}.md`.
 */

// Factory form is REQUIRED: `vi.mock` is hoisted by Vitest's transform
// above all imports, and the factory receives the `vi` object so the
// `vi.fn()` stubs are recreated per test. `clearMocks: true` in
// `apps/web/vitest.config.ts:38` resets the stubs automatically, so
// tests do not need to manually clear them between scenarios.
//
// `useRouter` returns the FULL router shape (`push`, `replace`, `back`,
// `forward`, `refresh`, `prefetch`) — the 3 affected form components
// call `useRouter().push(...)` for success-path navigation; a minimal
// stub that only returns `{ replace }` would silently break those
// success-path assertions. The auth forms' per-file mock returns
// only `{ replace }` because they only call `replace`; we return the
// full shape here so any router-using component is covered.
//
// `useSearchParams` returns a fresh `URLSearchParams()` (WHATWG spec
// class implemented at full fidelity in happy-dom 20.10; the 3
// affected components call `.get(...)` only). `useParams` returns
// `{}` so a future component that destructures it does not crash on
// `undefined`.
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
  useParams: () => ({}),
}));
```

**Diff summary**:

- After `import "@testing-library/jest-dom/vitest";` add `import { vi } from "vitest";`.
- Append one JSDoc paragraph to the existing block (after the current "No other setup is required" paragraph) explaining the `next/navigation` invariant, the OOM cascade, the slice-7 workaround coexistence, and the file's single-source-of-truth role.
- Append one JSDoc comment immediately above the `vi.mock` factory explaining the factory form, the full router shape rationale, and the `URLSearchParams` / `useParams` rationale.
- Append the `vi.mock("next/navigation", () => ({ … }))` factory at the end of the file.
- File LOC: 22 → ~50 (+28 / -0).
- No other declaration in the file changes.

**Verification**:

- AC1: `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit.
- AC2: the factory returns `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() })`.
- AC3: the factory returns `usePathname: () => "/"`, `useSearchParams: () => new URLSearchParams()`, `useParams: () => ({})`.
- AC4: the JSDoc prose explains happy-dom app-router absence + the OOM cascade.

---

### File 2 — `apps/web/vitest.config.ts` (VERIFY ONLY, no edit)

This file is **not** modified by this change. We verify only that the `setupFiles` array still references `apps/web/__tests__/setup.ts` (so the mock lands there automatically) and that the slice-7 PR-7 `pool: "forks"` workaround is preserved.

Relevant excerpt from `apps/web/vitest.config.ts`:

```typescript
test: {
  include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  environment: "happy-dom",
  globals: false,
  clearMocks: true,
  setupFiles: ["./__tests__/setup.ts"],         // ← line 39: lands the new mock
  pool: "forks",                                 // ← line 54: preserved
  // @ts-expect-error — poolOptions is in the vitest runtime config …
  poolOptions: {                                 // ← lines 59-63: preserved
    forks: {
      singleFork: true,
    },
  },
  testTimeout: 15000,
  hookTimeout: 15000,
},
```

**Verification** (during apply):

- AC5: `grep -n 'setupFiles' apps/web/vitest.config.ts` shows `["./__tests__/setup.ts"]`.
- AC6: `grep -n 'pool' apps/web/vitest.config.ts` still shows `pool: "forks"` AND `singleFork: true`.

---

### File 3 — `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (VERIFY ONLY, no edit)

This file is the **regression surface**. It is NOT modified by this change. The only mock currently in the file is the per-test `vi.mock("@/lib/transactions-api", …)` block at lines 39-54 (mocking the API client, NOT `next/navigation`).

The 15 scenarios that previously threw are distributed across:

- 5 × `TransactionsList` (renders the table, which contains `RowEditMenu` — `TransactionsList.tsx:290` calls `useRouter()`).
- 5 × `CreateTransactionForm` (the form component calls `useRouter().push(...)` on submit success — `CreateTransactionForm.tsx:54`).
- 5 × `EditTransactionForm` (the form component calls `useRouter().push(...)` on update success — `EditTransactionForm.tsx:50`).

The 10 scenarios that already pass:

- 5 × `CategoryManager` (does NOT call `useRouter()`; only mutates categories via the API).
- 5 × `SessionList` (does NOT call `useRouter()`; only lists sessions; the 2 `findByText(/500/i)` sub-failures are out of scope per proposal §2.2).

**Verification** (during apply):

- AC11: `grep -E "\.(skip|todo)\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns the same hit count as on `develop@d9fdfec` (no new decorations).
- AC10: `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25/25 PASS.

---

## 3. Execution plan (strict TDD)

Per AGENTS.md §4, strict TDD requires RED → GREEN → TRIANGULATE → REFACTOR order. The existing RED is captured by the current `pnpm --filter web test` exit-1 (25/145 failing after 255s of OOM cascade). No new test file is needed; `state-coverage.test.tsx` IS the regression surface.

1. **RED already observed** (recorded in explore brief Engram `#2361` §2, §4.2 + proposal §3 step 1). `pnpm --filter web test` currently exits 1 with 25/145 failing, 120/145 passing, `Worker exited unexpectedly`, V8 heap ~4 GB. RED is the existing exit-1 of `state-coverage.test.tsx`; no new test file required (AGENTS.md §4 exception for pre-existing RED is explicit: "a failing test that reproduces the failure must exist BEFORE the production change").

2. **Edit File 1** (`apps/web/__tests__/setup.ts`): add the `vi.mock("next/navigation", …)` factory at the bottom + JSDoc paragraph above it (per §2 File 1). No other files touched.

3. **Verify File 2** (`apps/web/vitest.config.ts`): confirm `setupFiles: ["./__tests__/setup.ts"]` at line 39 still wires the modified setup file. No edit needed.

4. **GREEN: run state-coverage test in isolation**: `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx`. MUST exit 0 with 25/25 PASS (was 15/25 throwing). Verifies the 3 affected form components now find a fake router. Wall time should be <10s.

5. **GREEN: run full apps/web suite**: `pnpm --filter web test`. MUST exit 0 with `Tests 145 passed (145)`. The 17 other test files (120 tests) that already passed continue to pass — the global mock is a no-op for them (they don't render router-using components; the `useRouter()`/`usePathname()`/`useSearchParams()` stubs are never called). Wall time MUST drop below 30s. No `Worker exited unexpectedly`. No `FATAL ERROR: Ineffective mark-compacts near heap limit`.

6. **Verify BDD not regressed**: `pnpm turbo run bdd`. MUST exit 0 with 43/43. Confirms no Cucumber feature file, step definition, world file, or workspace-port was touched.

7. **Verify slice-7 workaround preserved**: `grep -n "pool" apps/web/vitest.config.ts` MUST still show `pool: "forks"` AND `singleFork: true`. `git log --oneline | grep 36386e1` MUST still show the slice-7 PR-7 commit intact.

8. **Commit atomically**: 2 commits (per §4 below).

---

## 4. Atomic commits

Single PR, 2 atomic commits (work-unit aligned; per AGENTS.md §5 each commit reverses cleanly with `git revert <sha>`):

1. `test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (R1, R2)` — the production-code change: add the global mock factory + JSDoc to `apps/web/__tests__/setup.ts`. Note the `test:` type per AGENTS.md §6 vocabulary (the change IS a test-infra change, not a feature; `fix:` would mislead because no production feature is being added).

2. `chore(web): verify pnpm --filter web test exits 0 with 145/145 (R4 marker)` — verification log: the `pnpm --filter web test` exit-0 output captured in the commit body. Optional but it gives the slice-8 close-out a paper trail. Can be folded into commit 1 if the reviewer prefers fewer commits — but splitting makes the GREEN observation distinct from the GREEN-causing change.

**Commit hygiene** (AGENTS.md §6):

- No `Co-Authored-By` / no AI attribution.
- Subjects ≤72 chars, imperative, no trailing period.
- Type vocabulary from §6: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- Bodies explain WHY (the OOM cascade, the slice-7 workaround coexistence), not WHAT (the diff already shows what).

---

## 5. Test execution plan

| Spec scenario | Test command | Expected outcome |
|---------------|--------------|------------------|
| **G1.1** (apps/web suite 0) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; wall <30s; no `Worker exited unexpectedly`; no `FATAL ERROR` (AC7, AC8, AC9) |
| **G2.1** (state-coverage 25/25) | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS; no `.skip`/`.todo` added (AC10, AC11) |
| **G3.1** (mock is durable) | (covered by G1.1) — the test count includes the 18 existing files (≥145 tests across ≥18 files), proving the global mock applies to every file. A new hypothetical `foo.test.tsx` rendering a `useRouter()`-using component would pass without per-file mock (AC19). |
| **G4.1** (BDD not regressed) | `pnpm turbo run bdd` | exit 0; 43/43 (AC12) |
| **G5.1** (no source touched) | `git diff --name-only origin/develop..HEAD \| grep -E 'apps/web/(components\|lib\|app)/.*\.tsx$\|apps/web/(lib)/.*\.ts$\|apps/api/.*\.ts$\|libs/.*\.ts$'` | empty (AC13, AC14) |
| **G6.1** (slice-7 workaround preserved) | `grep "pool" apps/web/vitest.config.ts` | still shows `pool: "forks"` and `singleFork: true` (AC6); `git log --oneline \| grep 36386e1` returns 1 hit (AC15) |

### Manual / non-CI verification steps

- `pnpm --filter web test --reporter=verbose` to enumerate each of the 145 scenarios and confirm no `.skip` / `.todo` decoration.
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR|invariant expected"` to confirm the OOM signature is absent from stderr.
- `time pnpm --filter web test` to capture the wall time (`real` < 30s per AC9).
- `git log --oneline develop..feat/fix-web-vitest-crash` to confirm the 2 work-unit commits (subjects ≤72 chars, no "Co-Authored-By", per AC16 + AC17).
- `git show 36386e1 -- apps/web/vitest.config.ts` to confirm the slice-7 workaround commit is preserved (NOT amended or rebased).
- `pnpm lint:fixtures` to confirm the boundary plugin still passes (no new rule needed; the mock is test-infra, not a code-boundary guard — proposal §4.3 confirms).
- `pnpm turbo run lint typecheck` to confirm ESLint and TypeScript still pass (no production source touched, so trivial).

---

## 6. Risks + mitigations (concrete)

| ID | Risk | Mitigation |
|----|------|------------|
| **R1** | Adding the global mock to `setup.ts` could break an unrelated test that was relying on the ABSENCE of a router mock. | The mock is a no-op for tests that don't render Next.js components — the `useRouter()` / `usePathname()` / `useSearchParams()` / `useParams()` stubs are never called by them. The 17 currently-passing files (120 tests) will continue to pass; `clearMocks: true` at `apps/web/vitest.config.ts:38` resets the `vi.fn()` stubs per test. **Verification**: G1.1 runs the full 145-test suite; if any unrelated test fails, the failure mode points at a test that imports `next/navigation` directly (none currently do — the auth forms go through `next/navigation` and they already have a per-file mock that just gets shadowed by the global one). |
| **R2** | Vitest's hoisting might conflict with the existing per-file `vi.mock("next/navigation", …)` in `apps/web/__tests__/components/auth/state-coverage.test.tsx` L47-49. | Per-file `vi.mock` overrides the global one for that file's scope (Vitest applies mocks in import order; the per-file call re-binds the factory for that file's test run). The auth tests continue to pass with the per-file mock in place — verified by the existing 120-test baseline. The per-file mock becomes redundant after this PR but is left intact for the follow-up cleanup (out of scope per proposal §2.2). **Verification**: G1.1 (full suite) catches any regression. |
| **R3** | The vitest-4 `test.poolOptions` deprecation warning is still present and may become a hard error in vitest 5. | Out of scope per proposal §2.2; separate ticket. The slice-7 PR-7 workaround stays; the `poolOptions` deprecation does not block this fix. The fix is additive, not a replacement. |
| **R4** | The factory-form mock returns a plain object for `useSearchParams()` (`new URLSearchParams()`) — some components may destructure methods off `URLSearchParams` that don't exist on the happy-dom polyfill. | `URLSearchParams` is a WHATWG spec class implemented in happy-dom at full fidelity. The 3 affected components (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) call `useSearchParams().get("…")` only; `URLSearchParams.get` is present in happy-dom 20.10. Verified by component source (no `.entries()`, `.forEach()`, or `.keys()` usage on `useSearchParams()`). |
| **R5** | The fix could be mistaken for a "drop the `import type`" exercise (mirroring the `fix-api-nestjs-di` precedent) and re-trigger the slice-8 PR-2 confusion. | The auth split (`auth-client.ts` / `auth-server.ts`) is `import type` (erased at compile time) — explore brief §6 verifies it's transparent to vitest workers. The OOM has nothing to do with the auth split; the commit log (slice-7 PR-7 `36386e1` introduced the workaround PRE-PR-2 in 2026-07-08) is the smoking gun. The PR description (per spec R10) MUST cite this explicitly so reviewers don't re-walk the dead end. |

---

## 7. Out of scope

Restated from proposal §2.2 + spec §10 + AGENTS.md §11. The following are explicitly NOT touched by this PR:

1. The 2 SessionList `findByText(/500/i)` sub-failures (the mocked `Response` has no `statusText`, so `'500 '` matches with a trailing space) — separate ticket. Independent of the OOM cascade.
2. The vitest-4 `test.poolOptions` deprecation warning ("`test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options") — separate ticket. Will become a hard error in vitest 5. Project is on vitest 4.1.9.
3. The slice-7 PR-7 `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` workaround at `apps/web/vitest.config.ts:54-63` — PRESERVED, not removed. Mitigates a different failure mode (React 18 `useEffect`-driven state-update race in `EditTransactionForm`'s mount-then-load-then-setState pattern).
4. The orphan shared dirs (`libs/features/*/shared/` with empty imports) — separate ticket, slice-7 inheritance debt.
5. Refactoring `TransactionsList` / `CreateTransactionForm` / `EditTransactionForm` to not call `useRouter()` — production code stays as-is.
6. Removing the per-file `vi.mock("next/navigation", …)` block at `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49` — the global mock makes it redundant, but removal is a follow-up cleanup.
7. Mocking `next/link` (JSX component, not a hook), `next/router` (pages-router equivalent, not used), or `next/headers` (server-only API, not used by the 3 affected components) — apps/web is App Router exclusively.
8. New ADR under `docs/architecture/decisions/` — the JSDoc paragraph in `setup.ts` is the documentation per spec Q1 resolution.
9. New ESLint rule in `tools/eslint-plugin-boundary/` — the mock is a test-infra convention, not a code-boundary guard (proposal §4.3 confirms).
10. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — the fix is apps/web-only.
11. Any new test file (no new `.test.ts` / `.test.tsx`) — the existing `state-coverage.test.tsx` is the regression surface.
12. Any vitest version upgrade (4.1.9 → v5 or similar).
13. Coverage gate enforcement at CI (AGENTS.md §11).
14. Migration of `gastos-personales/` to the vertical-slicing model (the playbook ships here; the migration runs in slice-8 8.4 per AGENTS.md §11).
15. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config), observability (OpenTelemetry, Prometheus, log shipping), audit log UI (AGENTS.md §11).
16. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` or amending any slice-7 chain commit (`36386e1`, `2e05fc5`).
17. A Spanish mirror of `design.md` (per orchestrator instruction + `fix-api-nestjs-di` precedent — change-folder design/spec/proposal are coordination artifacts between SDD phases, not user-facing docs).

---

## 8. Open questions for tasks phase

**None.** All 3 questions deferred from the proposal are resolved in the spec:

- Q1 (mock surface area) → resolved: full router shape `{ push, replace, back, forward, refresh, prefetch }` + `usePathname`/`useSearchParams`/`useParams` stubs. Spec §11 Q2.
- Q2 (per-file mock cleanup) → resolved: deferred to follow-up cleanup; this PR only ADDS the global mock, does NOT remove the redundant per-file mock at `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49`. Spec §11.
- Q3 (slice-7 workaround removal) → resolved: workaround PRESERVED. Mitigates a different failure mode. Spec §11.

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check post-merge:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | `pnpm --filter web test` exits 0 | exit 0; `Tests 145 passed (145)` (AC7) |
| 2 | No OOM signature in stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` exits 1 (AC8) |
| 3 | Wall time below 30s | `time pnpm --filter web test` reports `real` < 30s (AC9) |
| 4 | state-coverage.test.tsx all 25 pass | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` exits 0; 25 PASS / 0 FAIL (AC10) |
| 5 | No `.skip` / `.todo` decoration added | `grep -E "\.(skip\|todo)\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` matches the `develop@d9fdfec` hit count (AC11) |
| 6 | `pnpm turbo run bdd` exits 0 | 43/43 scenarios pass (AC12) |
| 7 | No source file touched | `git diff --stat develop..feat/fix-web-vitest-crash -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` is empty (AC13) |
| 8 | Only `setup.ts` is edited under `apps/web/` | `git diff --name-only develop..feat/fix-web-vitest-crash -- 'apps/web/'` returns exactly `apps/web/__tests__/setup.ts` (AC14) |
| 9 | `vitest.config.ts` setupFiles unchanged | `grep -n 'setupFiles' apps/web/vitest.config.ts` shows `["./__tests__/setup.ts"]` (AC5) |
| 10 | `vitest.config.ts` `pool: "forks"` unchanged | file still has `pool: "forks"` and `singleFork: true` (AC6) |
| 11 | Slice-7 commit `36386e1` preserved | `git log --oneline feat/fix-web-vitest-crash \| grep 36386e1` returns 1 hit (AC15) |
| 12 | No "Co-Authored-By" in any commit | `git log feat/fix-web-vitest-crash --pretty=format:"%B" \| grep -i "co-authored-by"` is empty (AC16) |
| 13 | Commit subjects are Conventional + ≤72 chars | `git log -1 feat/fix-web-vitest-crash --pretty=format:"%s"` matches `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` and is ≤72 chars (AC17) |
| 14 | PR base branch is `develop` | the PR's `base` ref is `develop`, NOT `main` (AC18) |
| 15 | Mock factory shape | grep confirms `useRouter` returns `{ push, replace, back, forward, refresh, prefetch }` (AC2) + `usePathname`/`useSearchParams`/`useParams` stubs present (AC3) |
| 16 | JSDoc paragraph present | `setup.ts` contains the JSDoc prose explaining happy-dom + OOM cascade (AC4) |
| 17 | Mock factory present | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit (AC1) |
| 18 | Single PR, no force-push | `git log develop..feat/fix-web-vitest-crash --merges` returns ≤1 commit; no history rewrite (AC20) |

---

## 10. Traceability

| Spec requirement | Design section |
|------------------|----------------|
| R1 (setup.ts hoists `vi.mock("next/navigation", …)` factory) | §2 File 1 (the factory) |
| R2 (factory returns the minimal 4-hook shape) | §2 File 1 (the factory's exact return value) |
| R3 (vitest.config.ts continues to reference setup.ts) | §2 File 2 (verify only; `setupFiles` at L39 unchanged) |
| R4 (`pnpm --filter web test` exits 0 with 145/145) | §3 step 5 + §5 G1.1 + §9 row 1 |
| R5 (state-coverage.test.tsx all 25 pass) | §3 step 4 + §5 G2.1 + §9 row 4 |
| R6 (`pnpm turbo run bdd` continues to exit 0) | §3 step 6 + §5 G4.1 + §9 row 6 |
| R7 (no component source touched) | §2 (only setup.ts edited) + §5 G5.1 + §9 rows 7-8 |
| R8 (slice-7 `pool: 'forks'` workaround preserved) | §2 File 2 (verify only; L54-63 unchanged) + §3 step 7 + §5 G6.1 + §9 rows 10-11 |
| R9 (JSDoc comment explains why) | §2 File 1 (the appended JSDoc paragraphs) |
| R10 (PR description references 4-PR BDD bypass streak) | §4 commit 2 body / PR description (operational, no AC binary check) |

| Goal | Spec scenario | Design section |
|------|---------------|----------------|
| G1 (apps/web suite 0) | G1.1 | §3 step 5, §5 G1.1 |
| G2 (state-coverage 25/25) | G2.1 | §3 step 4, §5 G2.1 |
| G3 (mock is durable) | G3.1 | §1 G3, §5 G3.1 |
| G4 (BDD not regressed) | G4.1 | §3 step 6, §5 G4.1 |
| G5 (no source touched) | G5.1 | §1 G5, §2 (only setup.ts edited), §5 G5.1 |
| G6 (slice-7 workaround preserved) | G6.1 | §1 G6, §2 File 2 (verify), §5 G6.1 |

---

## 11. Threat matrix

> Per `sdd-design/SKILL.md` §2a: applicability-driven. If the design changes routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration, load `references/threat-matrix.md` and include its matrix.

**N/A** — this design does NOT change routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration. The fix is a test-infra change (a `vi.mock` factory in a vitest setup file). It does not introduce new shell invocations, subprocesses, file watchers, or runtime forks. The slice-7 `pool: "forks"` workaround is the existing process-integration boundary, and it is preserved unchanged — this design does NOT modify it.

Boundary classification: **pure test configuration**, no production behavior change, no executable-file classification change, no VCS automation beyond a single conventional-commit PR (covered by AGENTS.md §6, not by the threat matrix).

---

## 12. Migration / Rollout

**No migration required.** This is a test-infra fix with zero production behavior change. Rollout is the standard single-PR flow:

1. Cut `feat/fix-web-vitest-crash` from `develop@d9fdfec`.
2. Land the 2 atomic commits per §4.
3. Open a single PR against `develop`.
4. After review + CI green, merge (squash or merge commit; `git log develop..feat/fix-web-vitest-crash --merges` ≤1 per AC20).
5. No feature flag, no phased rollout, no database migration, no backwards-compat shim.

**Rollback plan** (mirror proposal §8):

- **Whole-change**: `git revert <merge-sha>` on `develop`. The `setup.ts` edit reverts to its 22-line baseline; `vitest.config.ts` is unchanged (no revert needed). The 25 scenarios in `state-coverage.test.tsx` return to their previously-failing state (acceptable because the same tests were already broken on `develop@d9fdfec` — slice-8 verify report Gate 3 / observation F1 of the slice-7-inheritance debt).
- **Per-step rollback**:
  - Commit 1 (the `vi.mock` hoist) — `git revert <sha>`. Tests fail again as before. Vitest config is untouched, so no config revert needed.
  - Commit 2 (verification marker) — optional revert; it carries no executable code change.
- **Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, or amend commit `36386e1` (slice-7 workaround) or `2e05fc5` (slice-8 PR-2 false lead).

---

## 13. Cross-references

- **Proposal**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
- **Spec**: `openspec/changes/fix-web-vitest-crash/spec.md` (Engram `#2363`; G1-G6, R1-R10, 20 ACs)
- **Explore brief**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
- **Smoking-gun error**: `invariant expected app router to be mounted` at `next@16.2.10/navigation.ts:179`
- **Pre-existing pattern (source for the global hoist)**: per-file `vi.mock("next/navigation", …)` at `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49`
- **Vitest config wiring**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`)
- **Slice-7 workaround (predecessor, preserved)**: commit `36386e1`, `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **Slice-8 PR-2 false lead (NOT implicated)**: commit `2e05fc5` (auth-client.ts / auth-server.ts split) — `import type` erased at compile time, transparent to vitest workers (explore brief §6)
- **OOM evidence**: explore brief §2 (255s wall time, ~4 GB V8 heap, `FATAL ERROR: Ineffective mark-compacts near heap limit`)
- **Affected components**: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (inside `RowEditMenu`)
- **Regression surface**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios)
- **Slice-8 verify report**: Engram `#2278` (confirmed BDD gate GREEN; OOM is Gate 3 / unit-tests-only)
- **Format precedent**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (14-section structure: G↔T mapping, file-by-file diffs, execution plan, atomic commits, test plan, risks, out-of-scope, open questions, validation criteria, traceability, threat matrix, migration, cross-refs, appendix)
- **Project conventions**: AGENTS.md §1 (stack), §2 (branch model), §4 (strict TDD — RED is the existing exit-1, no new test file), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — mock in exactly one place after this PR), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder design per orchestrator instruction + `fix-api-nestjs-di` precedent)

---

**Next phase**: `tasks` (`sdd-tasks` will break the 2 atomic commits into ordered RED-first sub-tasks with checkpoint gates per AGENTS.md §4 + §5).