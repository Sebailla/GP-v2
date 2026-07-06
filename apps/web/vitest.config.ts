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
  },
  resolve: {
    alias: {
      // `@/` aliases mirror the tsconfig paths so primitives can
      // `import { cn } from "@/lib/utils"`.
      "@": path.resolve(__dirname, "."),
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
