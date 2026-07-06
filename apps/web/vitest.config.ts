import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for `apps/web` — slice 4 (T4.2 + T4.3 + T4.5 first
 * batch).
 *
 * Slice 1 deferred the apps/web vitest install because no tests existed;
 * slice 4 batch 4a closes that deferred item alongside the T4.2/T4.3/T4.5
 * work. The pattern mirrors `libs/features/auth/server/vitest.config.ts`:
 * tests live under `__tests__/` at the workspace root (colocated with
 * the file under test), the runner is `node` because the slice-4 helpers
 * (cn, middleware, JSON-parsed catalogs) are framework-agnostic at the
 * test boundary.
 *
 * The `resolve.alias` block points `next-intl/navigation`, `next-intl/
 * server`, and `next-intl/middleware` at the real package — pnpm's
 * strict workspace resolution otherwise refuses to load them from an
 * app-side vitest context because of how the `exports` map is structured
 * across the `react-server` / `default` conditional.
 */
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
  resolve: {
    alias: {
      // `next-intl/server` uses React-Server-Conditional Exports which
      // require the consuming environment to declare itself. The `ssr:
      // false` boundary tells next-intl it's safe to load the client
      // build in this vitest context. We declare it globally so any
      // test that imports the middleware doesn't trip the warning.
      "next-intl/navigation": path.resolve(
        "node_modules/next-intl/dist/navigation.client.js",
      ),
      "next-intl/server": path.resolve(
        "node_modules/next-intl/dist/server.react-client.js",
      ),
    },
  },
});
