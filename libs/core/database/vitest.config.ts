import { defineConfig } from "vitest/config";

/**
 * Vitest config for @core/database. Tests live under src/__tests__/ per
 * the project's libs convention. Uses the `node` environment because
 * the singleton pattern relies on `globalThis`.
 */
export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
    // M5 D4 — per-package coverage threshold (60% on lines,
    // branches, functions, statements). See the observability
    // spec's "Coverage Gate Enforcement" requirement + the
    // apps/api vitest config for the canonical explanation.
    coverage: {
      provider: "v8",
      thresholds: {
        global: {
          lines: 60,
          branches: 60,
          functions: 60,
          statements: 60,
        },
      },
    },
  },
});
