import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Vitest config for `apps/web` — slice 4 (T4.2 + T4.3 + T4.5 batch 4a;
 * T4.4 + T4.6 + T4.7 batch 4b).
 *
 * Slice 1 deferred the apps/web vitest install because no tests existed;
 * slice 4 batch 4a closed that deferred item alongside the T4.2/T4.3/T4.5
 * work (cn helper + middleware + catalog parity). Slice 4 batch 4b adds
 * the `happy-dom` environment + `@testing-library/jest-dom` matchers so
 * the shadcn-style primitives (T4.4) can be tested via React Testing
 * Library's `render()` + the `toBeInTheDocument` matchers.
 *
 * The `@vitejs/plugin-react` plugin is REQUIRED here because the apps/web
 * tsconfig sets `"jsx": "preserve"` (Next.js's canonical setting) and
 * Vite's import-analysis plugin refuses to parse JSX in that mode (it
 * errors with "Failed to parse source for import analysis because the
 * content contains invalid JS syntax"). The React plugin installs an
 * esbuild-based JSX transform that the import-analysis step honors.
 *
 * The `setupFiles` block loads the jest-dom matchers BEFORE any test
 * module so `expect(...).toBeInTheDocument()` resolves at call time.
 *
 * The `resolve.alias` block points `next-intl/navigation`, `next-intl/
 * server`, and `next-intl/middleware` at the real package — pnpm's
 * strict workspace resolution otherwise refuses to load them from an
 * app-side vitest context because of how the `exports` map is structured
 * across the `react-server` / `default` conditional.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    // Slice 7 PR-7: the happy-dom 20.10 + vitest 4.1 worker pool
    // has a known instability with React 18 + useEffect-driven state
    // updates in component trees (e.g. EditTransactionForm's
    // mount-then-load-then-setState pattern). The worker exits
    // prematurely after ~3-4 minutes with the default
    // `pool: "threads"` setting when 5 forms × 5 states race each
    // other in the same worker.
    //
    // Fix: serialize the test suite by switching to the
    // `forks` pool with `singleFork: true`. Tests run serially in
    // a single fork, which is slower (~30% slower) but stable.
    // The throughput regression is acceptable for the 25-test
    // state-coverage harness; the rest of the apps/web unit
    // suite is small enough that the regression is in the noise.
    pool: "forks",
    // @ts-expect-error — poolOptions is in the vitest runtime config
    // but not on the strict `InlineConfig` type in vitest 4.1.
    // The fix in the upstream type is queued; using a comment here
    // is cheaper than the `@ts-expect-error` on the whole line.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Bounded test timeouts. Default is 5s; the slice 6 PR-D
    // EditTransactionForm `prefills` test needs a longer window
    // for the `findByDisplayValue` poll (the happy-dom worker
    // exit failure was a worker-pool signal, but the per-test
    // timeout was also too tight for the multi-form state-coverage
    // harness). 15s gives each test the room it needs without
    // letting a single bad test mask the whole suite.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: [
      {
        find: /^@features\/auth\/shared\/schemas$/,
        replacement: path.resolve(__dirname, "../../libs/features/auth/shared/schemas/index.ts"),
      },
      {
        find: /^@features\/auth$/,
        replacement: path.resolve(__dirname, "../../libs/features/auth/server/src/index.ts"),
      },
      {
        find: /^@features\/transactions\/shared\/schemas$/,
        replacement: path.resolve(
          __dirname,
          "../../libs/features/transactions/shared/schemas/index.ts",
        ),
      },
      {
        find: /^@features\/transactions$/,
        replacement: path.resolve(__dirname, "../../libs/features/transactions/client/index.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "."),
      },
      {
        find: /^next-intl\/navigation$/,
        replacement: path.resolve(__dirname, "node_modules/next-intl/dist/navigation.client.js"),
      },
      {
        find: /^next-intl\/server$/,
        replacement: path.resolve(__dirname, "node_modules/next-intl/dist/server.react-client.js"),
      },
      // Slice 8.1.2 — the `server-only` marker package throws unconditionally
      // when imported from a Node-side test runner (vitest runs in Node, not
      // in a Next.js react-server context). The package ships an `empty.js`
      // shim under the `react-server` export condition that does nothing; we
      // alias it so vitest can import `auth-server.ts` (which uses the marker
      // to gate itself against client bundling) without exploding at module
      // load time.
      {
        find: /^server-only$/,
        replacement: path.resolve(__dirname, "node_modules/server-only/empty.js"),
      },
    ],
  },
});
