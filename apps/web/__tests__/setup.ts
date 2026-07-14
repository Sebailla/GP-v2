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
