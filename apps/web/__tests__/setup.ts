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