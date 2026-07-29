import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: [],
    // M5 D4 — per-package coverage threshold (60% on lines,
    // branches, functions, statements). See the observability
    // spec's "Coverage Gate Enforcement" requirement + the
    // apps/api vitest config for the canonical explanation.
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
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