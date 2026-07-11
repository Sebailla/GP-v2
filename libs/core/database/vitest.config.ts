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
  },
});
