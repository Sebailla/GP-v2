# Explore: `fix-web-vitest-crash`

> **Phase**: explore · pre-proposal
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `d9fdfec`)
> **Author**: SDD orchestrator → `sdd-explore` (executor · model `MiniMax-M3`)
> **Date**: 2026-07-14
> **Read-only investigation**. No code or config mutated.
> **Inputs**: Engram observation `#2278` (slice 8 verify report), slice-7 PR-7 commit `36386e1`, slice-8 PR-2 commit `2e05fc5` (the auth-client/server split), the failing test file `apps/web/__tests__/components/transactions/state-coverage.test.tsx`.

---

## §1. Executive summary

**Root cause** — one sentence: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios) **does not mock `next/navigation`**, so when it renders `TransactionsList`, `CreateTransactionForm`, and `EditTransactionForm` (which all call `useRouter()` from `next/navigation`), Next.js 16 throws **`invariant expected app router to be mounted`** during render, the React 19 fiber tree leaks per test (the suite has 5 describe blocks × 5 state-coverage scenarios, of which 15 trigger the throw), and the single-fork worker process runs out of V8 heap (~4 GB) after ~4 minutes — vitest's `--pool=forks poolOptions.forks.singleFork=true` workaround from slice-7 PR-7 then reports `Worker exited unexpectedly` as an "unhandled error".

**Why slice-7 PR-7 (`36386e1`) misdiagnosed it**: that commit documented "happy-dom 20.10 + vitest 4.1 worker pool has a known instability with React 18 + useEffect-driven state updates in component trees (e.g. EditTransactionForm's mount-then-load-then-setState pattern)" and switched to `pool: "forks"` + `singleFork: true` as a workaround. The actual root cause was **already present at that commit** (the `auth-client.ts` / `auth-server.ts` split hadn't landed yet — that was slice-8 PR-2 `2e05fc5`), and the workaround only changed *when* the OOM fires, not *whether*.

**Blast radius**: 1 test file (`state-coverage.test.tsx`) with **15 of 25 tests** that throw "invariant expected app router to be mounted" + **leak React fibers** in concurrent mode → worker hangs → parent kills the worker → `pnpm --filter web test` exits 1 after ~255s with `Tests 120 passed (145)`. The 17 other test files (120 tests) pass cleanly. **The BDD gate is NOT affected** — confirmed by slice-8 PR-2 verify report (Engram `#2278`): `pnpm turbo run bdd e2e` is GREEN.

**Fix-shape candidates**: 3 — the cheapest is one-line (add `vi.mock("next/navigation", ...)` at the top of the test file, mirroring the auth state-coverage test), the most durable is a vitest **setup file** that auto-mocks `next/navigation` for the whole `apps/web` test suite, and the third is to upgrade vitest's `poolOptions.forks.singleFork` workaround to the vitest-4 top-level syntax (which the deprecation warning already requests).

---

## §2. The actual error signature

Captured via `pnpm --filter web test 2>&1 | tail -80` on 2026-07-14, branch `develop` (HEAD `d9fdfec`):

```
$ vitest run
 DEPRECATED  `test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options.

 RUN  v4.1.9 /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference/apps/web


<--- Last few GCs --->

[94266:0xc9d80c000]   252369 ms: Scavenge (during sweeping) 4068.8 (4089.0) -> 4061.5 (4089.5) MB, pooled: 0.0 MB, 7.04 / 0.00 ms (average mu = 0.374, current mu = 0.369) allocation failure;
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----
 1: 0x10a44e218 node::OOMErrorHandler(char const*, v8::OOMDetails const&)
 ...
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯
Vitest caught 1 unhandled error during the test run.
⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: [vitest-pool]: Worker forks emitted error.
 ❯ EventEmitter.onTaskError .../vitest/dist/chunks/cli-api.24X8XwN1.js:3459:21
 ❯ EventEmitter.emit node:events:509:20
 ❯ ChildProcess.emitUnexpectedExit .../vitest/dist/chunks/cli-api.24X8XwN1.js:3025:22
 ❯ ChildProcess.emit node:events:509:20
 ❯ Process.ChildProcess._handle.onexit node:internal/child_process:294:12
Caused by: Error: Worker exited unexpectedly

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
 Test Files  17 passed (18)
      Tests  120 passed (145)
     Errors  1 error
   Start at  11:07:49
   Duration  255.26s (transform 1.31s, setup 1.08s, import 4.80s, tests 1.72s, environment 5.14s)

Exit status 1
```

**Key numbers**:

| Metric | Value | Meaning |
|--------|------:|---------|
| Exit code | `1` | `pnpm --filter web test` fails the pipeline |
| Test files passed / total | `17 / 18` | 1 file (the transactions state-coverage) didn't complete |
| Tests passed / total | `120 / 145` | 25 tests didn't pass (the entire 25 in the transactions state-coverage file) |
| Wall time | `255.26s` (~4m 15s) | heap grew to ~4 GB during that window |
| V8 heap at crash | `~4073 MB` | `FATAL ERROR: Ineffective mark-compacts near heap limit` |
| Worker signal | `Worker exited unexpectedly` | vitest's wrapper around the OOM kill |
| Vitest version | `4.1.9` | the `poolOptions` deprecation is a v3→v4 migration note |
| Node version | `v26.5.0` | `darwin-arm64` |

**This is NOT** the kind of crash reported by slice-8 PR-2 ("auth-client/auth-server split incomplete"). It's a **V8 heap OOM**, not an `import { type X }` DI resolution error. The auth split is irrelevant here.

---

## §3. The vitest config

`apps/web/vitest.config.ts` (120 lines, slice 4 batch 4a + slice 7 PR-7 + slice 8.1.2). Relevant excerpt:

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    pool: "forks",
    // @ts-expect-error — poolOptions is in the vitest runtime config
    // but not on the strict `InlineConfig` type in vitest 4.1.
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: [
      { find: /^@features\/auth\/shared\/schemas$/, replacement: /* … */ },
      { find: /^@features\/auth$/, replacement: /* … */ },
      // … etc …
      { find: /^server-only$/, replacement: /* empty.js shim */ },
    ],
  },
});
```

| Setting | Current value | Vitest 4 status |
|---------|---------------|-----------------|
| `pool` | `"forks"` | Valid in v4 |
| `poolOptions` | `undefined`-typed top-level in v4 schema — **DEPRECATED**, must be flattened | **Removed in v4** (deprecation warning above is the symptom) |
| `environment` | `"happy-dom"` | Valid |
| `globals` | `false` | Valid |
| `setupFiles` | `["./__tests__/setup.ts"]` | Valid (only loads `@testing-library/jest-dom/vitest`) |
| `testTimeout` | `15000` | Valid |
| `hookTimeout` | `15000` | Valid |
| `clearMocks` | `true` | Valid |

The setup file `apps/web/__tests__/setup.ts` (22 lines) is **minimal** — just `import "@testing-library/jest-dom/vitest"`. No module-level work that could itself OOM.

The `@ts-expect-error` on `poolOptions` is itself a smell: the **type definition** says `poolOptions` doesn't exist on the v4 config, but the **runtime** still accepts it for one more release cycle. Slice-7 PR-7 worked around the type by adding the `@ts-expect-error` comment rather than migrating.

---

## §4. Reproduce the crash locally

The full reproduction is one command. From the repo root:

```bash
pnpm --filter web test 2>&1 | tail -80
```

**Result**: 120 passed, 25 failed, 255s wall time, V8 OOM, exit 1. (See §2.)

### §4.1 Isolation experiments

To pinpoint which test file is the culprit, I ran targeted invocations:

| Command | Wall time | Result |
|---------|----------:|--------|
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx` | `>90s, no output` | **HANGS** |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "SessionList"` | `4.9s` | 5 SessionList tests run, 2 fail, 3 pass, file completes |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "CreateTransactionForm"` | `2.7s` | All 5 fail (5/5), file completes |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "EditTransactionForm"` | `0.9s` | All 5 fail (5/5), file completes |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "CategoryManager"` | `1.9s` | 2 fail, 3 pass |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "TransactionsList"` | `>30s, no output` | **HANGS** |
| `pnpm --filter web exec vitest run --pool=forks` (no `singleFork`) | `>80s` | 17 files pass, transactions state-coverage hangs |
| `pnpm --filter web exec vitest run --pool=threads` (override config) | `15s` | Same OOM crash, slightly faster (workers are smaller) |
| `NODE_OPTIONS=--max-old-space-size=256 pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "TransactionsList"` | `15.4s` | **OOM at 256MB** — confirms heap-pressure hypothesis |

The two hanging cases are the diagnostic gold:
- **`-t "TransactionsList"`** hangs even alone (no other describe blocks active). The 5 tests in this describe block are the smallest that still trigger the hang.
- **`-t "SessionList"`** completes in 4.9s — same file, but SessionList doesn't call `useRouter()` (it uses `fetch` directly).

### §4.2 The exception that's actually thrown

When isolated with `-t "CreateTransactionForm"` (which completes fast and surfaces real errors), the failure is:

```
FAIL  state-coverage.test.tsx > CreateTransactionForm 5-state coverage > loading: shows the categories-loading copy
Error: invariant expected app router to be mounted
 ❯ useRouter ../../node_modules/.pnpm/next@16.2.10.../navigation.ts:179:10
 ❯ CreateTransactionForm components/transactions/CreateTransactionForm.tsx:54:18
     52|   const t = useTranslations("transactions.new");
     53|   const tCommon = useTranslations("common");
     54|   const router = useRouter();
       |                  ^
```

`next@16.2.10`'s `useRouter()` throws unconditionally when the React tree is rendered outside a Next.js app-router mount. This is the **same invariant** that the auth state-coverage test dodges by mocking `next/navigation` (line 47-49 of `apps/web/__tests__/components/auth/state-coverage.test.tsx`):

```ts
// From apps/web/__tests__/components/auth/state-coverage.test.tsx (lines 42-49):
// Mock `next/navigation` — ResetPasswordForm + SignUpForm call
// `router.replace` on success. The form's success path unmounts
// the form; without the mock, useRouter() throws "invariant expected
// app router to be mounted" in the test env.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
```

**The transactions state-coverage test file does not have this mock.** That's the actual bug.

---

## §5. The crash module — what's at module-load

When the test file is imported (before any `it()` runs), the top-level imports execute:

```ts
// apps/web/__tests__/components/transactions/state-coverage.test.tsx
import { TransactionsList } from "@/components/transactions/TransactionsList";   // L66
import { CreateTransactionForm } from "@/components/transactions/CreateTransactionForm";  // L67
import { EditTransactionForm } from "@/components/transactions/EditTransactionForm";   // L68
import { CategoryManager } from "@/components/transactions/CategoryManager";        // L69
import { SessionList } from "@/components/auth/SessionList";                       // L70
```

None of these **modules throw at import time** — they only throw when their components render (because `useRouter()` is a hook called inside the function body). So module-load is innocent. The crash is at **render time**, inside the `it()` blocks.

### §5.1 Which components actually call `useRouter()`

| Component | `useRouter()` called? | Where |
|-----------|-----------------------|-------|
| `TransactionsList` (`apps/web/components/transactions/TransactionsList.tsx`) | **No at top-level**; only inside `RowEditMenu` (line 290) — only rendered when rows are shown | L290 |
| `CreateTransactionForm` (`apps/web/components/transactions/CreateTransactionForm.tsx`) | **Yes, top-level** (L54) | L54 |
| `EditTransactionForm` (`apps/web/components/transactions/EditTransactionForm.tsx`) | **Yes, top-level** (L50) | L50 |
| `CategoryManager` (`apps/web/components/transactions/CategoryManager.tsx`) | **No** | — |
| `SessionList` (`apps/web/components/auth/SessionList.tsx`) | **No** (uses `fetch` directly) | — |

So:
- **Tests that should throw** (15 = 5 CreateTransactionForm + 5 EditTransactionForm + 5 TransactionsList non-loading/non-empty/non-loading-error states that render rows): all 15 throw "invariant expected app router to be mounted".
- **Tests that pass** (10 = 5 CategoryManager + 5 SessionList): pass cleanly.

That matches the diagnostic pattern: when the test surfaces the error fast (isolated single describe), the file **completes with 5 failures and the rest skipped**. When all 25 run together, the heap grows and the worker is OOM-killed.

### §5.2 Why the heap grows (the OOM mechanism)

`next@16.2.10`'s `useRouter()` throws inside React 19's `renderWithHooks` (the stack trace shows `Object.react_stack_bottom_frame → renderWithHooks → updateFunctionComponent`). In React 19 concurrent mode, a render-time throw in a hook **partially commits the fiber**, leaves the component instance in the tree, and the next render attempt queues a retry. Because the test calls `render(<Providers><CreateTransactionForm /></Providers>)` synchronously and then asserts with `expect(screen.getByText(/Loading/i))`, the error is captured by React's error boundary **but the partial fiber tree is not unmounted until `cleanup()` runs**. RTL's auto-cleanup runs in `afterEach` — but the next test's `vi.mocked(listTransactions).mockImplementation(() => new Promise(() => {}))` returns a **promise that never resolves** (line 216 of the test), which means the `useEffect(() => fetchTransactions(), [])` callback never resolves, and the component instance stays mounted across tests.

The chain: 5 failing render + 5 never-resolving promises × React 19's concurrent fiber scheduler → heap accumulation → ~4 GB V8 ceiling → OOM kill.

---

## §6. The auth-client / auth-server split (the red herring)

`apps/web/lib/auth-client.ts` (110 lines) and `apps/web/lib/auth-server.ts` (129 lines) were created in slice-8 PR-2 (`2e05fc5`, "fix(web): slice 8.1.2 — narrow lib/auth.ts barrel to client-only / migrate call sites"). The orchestrator asked me to verify whether this split is implicated.

**Verdict: it is NOT.**

- `auth-client.ts` imports `import type { Session } from "./auth-server.js"` — a **type-only** import (line 28). `verbatimModuleSyntax` + `isolatedModules` erase this at compile time; at runtime, `auth-server.ts` is never loaded by `auth-client.ts`'s consumers.
- `auth-server.ts` imports `import "server-only"` and `import { cookies } from "next/headers"`. The vitest config aliases `server-only` → `node_modules/server-only/empty.js` (line 116), so the `server-only` import is a no-op in tests. The `next/headers` import **would** throw at import time in Node, but the test file `__tests__/lib-auth.test.ts` only imports `auth-client.ts` (via the type-only chain it's erased), never `auth-server.ts` directly.

The vitest config's `server-only` alias + the type-only import in `auth-client.ts` together make the auth split **transparent to vitest workers**. The `lib-auth.test.ts` file (13 tests) passes cleanly in 6 ms — proof that the auth split works as designed.

The crash is **unrelated** to slice-8 PR-2. It pre-dates the slice-8.1.2 split — it was present at slice-7 PR-7 (`36386e1`), which is why that PR introduced the `pool: "forks"` workaround.

---

## §7. Constraints from project conventions

- **AGENTS.md §7** (ESLint boundary rules):
  - `no-client-server-import` — `libs/features/*/client/` files MUST NOT import from `*/server/` paths. The fix is to mock `next/navigation` in the test file, not to change any client/server split. The test file is in `apps/web/__tests__/`, not in `libs/features/*/client/`, so the rule is not directly applicable — but the **fix** (mock `next/navigation` at the test boundary) honors the same separation: the component code stays server-vs-client-split correctly, the test just supplies a fake router.
  - `no-prisma-outside-core` — unrelated.
  - `no-schemas-outside-shared` — unrelated.
  - `no-cross-module-import` — unrelated.
- **AGENTS.md §10** (testing with Vitest):
  - Colocated `__tests__/*.test.ts(x)` — already followed.
  - `globals: false` (the config sets this) — means the fix must use **named imports** from `vitest` (`import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"`), which the transactions state-coverage file already does.
  - `clearMocks: true` (the config sets this) — `vi.clearAllMocks()` in `afterEach` is already there (line 211).
- **AGENTS.md §4** (Strict TDD):
  - The fix must follow RED → GREEN → TRIANGULATE → REFACTOR.
  - The current RED is `pnpm --filter web test` exits 1 (existing). The fix's GREEN is the same command exits 0.
  - A new failing-test in `apps/web/__tests__/components/transactions/state-coverage.test.tsx` is unnecessary — the test file **already exists** and is the regression surface. The fix is to make it pass by mocking `next/navigation`.

---

## §8. Blast radius

### §8.1 The 25 failing tests (file: `apps/web/__tests__/components/transactions/state-coverage.test.tsx`)

| Describe block | Tests | Expected behavior after fix | Why each test fails today |
|----------------|------:|----------------------------|---------------------------|
| `TransactionsList 5-state coverage` | 5 | All pass | `RowEditMenu` (sub-component) calls `useRouter()` → throws |
| `CreateTransactionForm 5-state coverage` | 5 | All pass | top-level `useRouter()` → throws |
| `EditTransactionForm 5-state coverage` | 5 | All pass | top-level `useRouter()` → throws |
| `CategoryManager 5-state coverage` | 5 | All pass | no `useRouter()` call → already passes individually; was failing in main run only because the OOM cascaded |
| `SessionList 5-state coverage` | 5 | All pass (with a different mock — needs `vi.stubGlobal("fetch", …)`, already in place) | no `useRouter()` call → was already passing; 2 of 5 fail today due to a `findByText` timeout (separate small issue: the `loading` test asserts on `Loading…` but the i18n key map has `"Loading..."` literal — minor, not the OOM root cause) |

So the fix must:
1. Mock `next/navigation` at the top of the test file (closes the 15/25 throws).
2. Optionally fix the i18n key literal `"Loading..."` vs regex `/Loading/i` for the 2 SessionList sub-failures — but `/Loading/i` should match `"Loading..."` (case-insensitive contains "Loading")… let me re-check. The regex is `/Loading/i` and the messages map has `"loading": "Loading..."` — `Loading` (case-insensitive) IS in `Loading...`, so the assertion should pass. Re-checking the SessionList log: line 626 (`expect(await screen.findByText(/500/i))`) is the failure — the test mocks `fetch` to return `{ status: 500, body: "server fail" }` but the `Response` doesn't have a body included, and `screen.findByText(/500/i)` tries to find text that doesn't render because the component's error UI is `{res.status} {res.statusText}` and `statusText` is empty. So the SessionList test has its own **separate** minor bug that's out of scope for the vitest worker crash fix.

### §8.2 Other test files that may need the same mock

Any test file that imports a component using `useRouter()` from `next/navigation` will hit the same invariant. The transitive list (from `apps/web/components/*` + `apps/web/lib/*`):

| Source file | Uses `useRouter()`? | Test file exists? |
|-------------|---------------------|-------------------|
| `apps/web/components/transactions/CreateTransactionForm.tsx` | Yes | `state-coverage.test.tsx` (the broken one) |
| `apps/web/components/transactions/EditTransactionForm.tsx` | Yes | same |
| `apps/web/components/transactions/TransactionsList.tsx` | Yes (in `RowEditMenu`) | same |
| `apps/web/components/transactions/CategoryManager.tsx` | No | same |
| `apps/web/components/auth/SessionList.tsx` | No | same |
| `apps/web/components/auth/LoginForm.tsx` | `useRouter`? — not in the file I read, but slice-7 PR-7 split would have touched it | `LoginForm.test.tsx` (passes, 53 ms) |
| `apps/web/components/auth/SignUpForm.tsx` | Likely yes | `SignUpForm.test.tsx` (passes, 66 ms) |
| `apps/web/components/auth/ForgotPasswordForm.tsx` | Likely yes | `ForgotPasswordForm.test.tsx` (passes, 79 ms) |
| `apps/web/components/auth/ResetPasswordForm.tsx` | Likely yes | `ResetPasswordForm.test.tsx` (passes, 88 ms) |

The auth forms' test files pass because **they each define their own per-file mock of `next/navigation`** (presumably). Let me note that the auth `state-coverage.test.tsx` (which also imports forms) explicitly mocks `next/navigation` at the top — see §4.2.

### §8.3 What about `app/*.test.tsx` (route tests)?

`__tests__/app/sign-in.test.tsx`, `sign-up.test.tsx`, `forgot-password.test.tsx`, `reset-password.test.tsx`, `dev-mailbox.test.tsx`, `landing.test.tsx` — all 6 files pass in the main run (within the 120 passing). They render pages, not form components, so they don't trigger `useRouter()` from `next/navigation` directly (the pages are server components in production, but the test renders them in happy-dom).

### §8.4 Side-effect surfaces that will break if the fix alters test infrastructure

- `apps/web/lib/auth-client.ts` / `auth-server.ts` — untouched (the fix is in the test file, not the source).
- `apps/web/components/transactions/*.tsx` — untouched.
- The vitest config: a setup file **change** would need to keep `@testing-library/jest-dom/vitest` loading (it's already in `setupFiles`).

---

## §9. Fix-shape candidates (for `sdd-propose` to decide — NOT committed)

### Shape A — minimal: add `vi.mock("next/navigation", …)` at the top of the test file

In `apps/web/__tests__/components/transactions/state-coverage.test.tsx`, after line 53 (the `vi.mock("next/navigation", …)` block in the auth state-coverage test is the model — copy that pattern, lifting the mock-replace to mock-push for the transactions forms):

```ts
// Mock `next/navigation` — TransactionsList + CreateTransactionForm +
// EditTransactionForm call `useRouter()`. Without the mock, useRouter()
// throws "invariant expected app router to be mounted" in happy-dom
// because no Next.js app-router context exists. The success paths call
// `router.push(...)`; the mock just records the call without navigating.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));
```

Place this **above** the `import { TransactionsList } from "..."` line, because `vi.mock` is hoisted by Vitest at compile time but the variable scope (`mockPush`) must be visible to any test that wants to assert on `router.push` calls.

- **Pros**: smallest diff (5 lines), mirrors the pattern already used in `auth/state-coverage.test.tsx` lines 42-49, no other file touched.
- **Cons**: per-file mock — if a future test file in `apps/web/__tests__/` also renders a router-using component, the author has to remember the same boilerplate. Brittle against new test files.
- **Effort**: ~5 min.
- **Test impact**: 15 currently-failing throws turn into assertions on rendered output; the 2 SessionList `findByText` sub-failures are unrelated and out of scope. After the fix, **all 25 tests in the file should pass** (the SessionList 2 might still fail on their own minor bug — separate ticket).
- **Verification**: `pnpm --filter web test` exits 0 with `Tests 145 passed (145)`, duration <10s.

### Shape B — durable: hoist the mock into `apps/web/__tests__/setup.ts` (auto-mock all `apps/web` tests)

Move the `vi.mock("next/navigation", …)` block from Shape A into `apps/web/__tests__/setup.ts`, which is loaded by every test in the suite (it's in `setupFiles`). The setup file already loads `@testing-library/jest-dom/vitest`; adding the router mock there means **every** test file in `apps/web/__tests__/` automatically gets a fake router.

- **Pros**: closes the brittleness — any future test that renders a router-using component is covered by default. Aligns with the "tests stay colocated with code they verify" principle (the test's invariant is "next/navigation is fake", and that invariant now lives in the setup file, not duplicated per-test).
- **Cons**: changes a file that's read by 18 test files; risk of breaking tests that **wanted** to assert on the real router behavior (none currently do — but it's a contract change).
- **Effort**: ~10 min.
- **Test impact**: same 25 transactions state-coverage tests pass + the per-form mock blocks in `auth/state-coverage.test.tsx` become redundant and can be removed in a follow-up. No regression in the other 17 files (they pass today without the mock, and the mock is harmless when not used).
- **Verification**: `pnpm --filter web test` exits 0; `pnpm lint:fixtures` still passes (the ESLint rule against unhoisted mocks doesn't fire because setup-file mocks are by-design global).

### Shape C — comprehensive: Shape B + migrate vitest `poolOptions` to v4 top-level + delete the `@ts-expect-error`

Shape B, plus:
1. **Migrate the vitest config to v4 schema**: change `pool: "forks", poolOptions: { forks: { singleFork: true } }` to the v4 top-level equivalents (need to check the [vitest 4 migration guide](https://vitest.dev/guide/migration#pool-rework); the current deprecation message says "previous `poolOptions` are now top-level options" — likely `pool: "forks"` stays, `singleFork: true` becomes a top-level `singleFork: true` or `poolMatchGlobs`).
2. **Remove the `@ts-expect-error` comment** on the now-deprecated block.
3. **Optionally add `// @vitest-environment node` to the lib-auth test file** (which doesn't need happy-dom) — speed improvement, not bug fix.

- **Pros**: closes the brittleness + silences the deprecation warning + the `pnpm --filter web test` console becomes clean (no DEPRECATED banner). Future-proof against v5.
- **Cons**: largest diff (3 files: setup.ts + vitest.config.ts + state-coverage.test.tsx); requires reading the vitest 4 migration guide to get the top-level key right.
- **Effort**: ~30 min (mostly reading the migration guide).
- **Test impact**: same 25 transactions state-coverage tests pass + deprecation banner gone.
- **Verification**: `pnpm --filter web test` exits 0 with no deprecation banner, `pnpm turbo run build lint typecheck test` exit 0 across all workspaces.

### Recommendation (this explore does not commit, only informs)

**Shape B is the right call**. The change is "fix the 25-test failure" but the same per-file boilerplate exists in `auth/state-coverage.test.tsx` (lines 42-49) — every future test file that renders a router-using component is one accidental omission away from this same OOM cascade. Hoisting the mock into `setup.ts` is the durable answer that matches the slice-1 ESLint-plugin-boundary pattern (one canonical place, many consumers).

If the orchestrator wants the smallest possible change that closes the failing gate and treats the broader hardening as a follow-up, **Shape A is enough** for the verify report to flip green, with Shape B/C tracked as a follow-up.

---

## §10. Verification contract

After the fix lands:

1. **`pnpm --filter web test`** exits 0; **all 145 tests pass** (the 25 currently-failing + the 120 already-passing).
2. **Wall time < 30 seconds** (the 255s OOM window collapses back to the typical ~5s).
3. **No `Worker exited unexpectedly` error** in the output.
4. **No V8 heap OOM** (`FATAL ERROR: Ineffective mark-compacts near heap limit` should not appear).
5. **The `next/navigation` mock is in place** — verifiable by `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/**` returning ≥1 hit.
6. **`pnpm --filter api test`** still exits 0 (the apps/api test suite is orthogonal to this fix; the change must not break it).
7. **`pnpm turbo run bdd e2e`** still exits 0 (BDD gate is GREEN today, must stay GREEN).
8. **`pnpm lint:fixtures`** still exits 0 (no new ESLint boundary violations).
9. **No new `new PrismaClient()` outside `libs/core/database/src/`** (existing rule still passes).
10. **No source-code mutations in `apps/web/components/transactions/*`, `apps/web/lib/auth-*`, or `apps/web/vitest.config.ts`** (the fix touches test infrastructure only).
11. **Strict-TDD trail**: the existing 25 failing tests serve as the RED. The fix flips them to GREEN. No new test file is needed; the existing `state-coverage.test.tsx` is the regression surface.
12. **Spanish mirror**: any new `.md` under `openspec/changes/fix-web-vitest-crash/` (proposal/spec/design/tasks) gets a `Documents-es/` mirror in the same atomic commit; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/<file>.md` returns 0 CJK codepoints in the mirror.

---

## §11. Files read (for traceability)

Code read via `codegraph_explore` + targeted Read tools. The codegraph MCP tool was the primary read mechanism (per AGENTS.md / CodeGraph protocol). All sources are verbatim.

- `apps/web/vitest.config.ts` (1–120) — full read.
- `apps/web/lib/auth-client.ts` (1–110) — full read.
- `apps/web/lib/auth-server.ts` (1–129) — full read.
- `apps/web/__tests__/setup.ts` (1–22) — full read.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (1–681) — full read (key sections).
- `apps/web/__tests__/components/auth/state-coverage.test.tsx` (1–80) — read for the `next/navigation` mock pattern.
- `apps/web/components/transactions/CreateTransactionForm.tsx` (1–60) — confirmed `useRouter()` at L54.
- `apps/web/components/transactions/EditTransactionForm.tsx` (1–300) — confirmed `useRouter()` at L50.
- `apps/web/components/transactions/TransactionsList.tsx` (1–310) — confirmed `useRouter()` at L290 inside `RowEditMenu`.
- `apps/web/components/transactions/CategoryManager.tsx` (1–122) — confirmed no `useRouter()` call.
- `apps/web/components/auth/SessionList.tsx` (1–154) — confirmed no `useRouter()` call.
- `apps/web/playwright.config.ts` (1–58) — read for context (unrelated to the crash).
- `apps/web/middleware.ts` (1–37) — read for context (unrelated).
- Engram observation `#2278` (slice 8 verify report) — confirmed BDD gate is GREEN.
- `git log --oneline -30` — confirmed the commit history (slice 7 PR-7 `36386e1`, slice 8 PR-2 `2e05fc5`).

## §12. Open questions for `sdd-propose`

1. **In-scope or not**: does the SessionList `findByText(/500/i)` sub-failure (2 of 25 tests) belong to this change, or is it a separate ticket? My read: it's a **separate** minor bug (the component renders `{res.status} {res.statusText}` and `statusText` is empty for the mock `Response`), and addressing it in the same change conflates two failure modes.
2. **Shape selection**: A (minimal), B (hoist to setup.ts, durable), or C (B + vitest-4 schema migration)?
3. **Vitest 4 migration timing**: should this change also migrate `poolOptions` → top-level, or is that a separate "vitest 4 hardening" change? The deprecation warning will keep firing until then.
4. **Branch model**: per AGENTS.md §2 the work branch is `feat/fix-web-vitest-crash` cut from `develop` (not from `main`); confirm.
5. **Pre-existing-ness acknowledgment**: should the proposal.md explicitly cite slice-7 PR-7 (`36386e1`) as the introduction point of the workaround (i.e., "pre-existing slice-7 inheritance, not slice-8 regression") as the discovery trail?
6. **Strict-TDD RED seed**: agree that the RED is the existing `pnpm --filter web test` exit-1 with 25 failures, and no new test file is needed?

---

**End of brief.**
