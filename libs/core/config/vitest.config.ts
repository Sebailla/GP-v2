import { defineConfig } from "vitest/config";

/**
 * Vitest config for @core/config. Tests live under __tests__/ (sibling
 * to source files) per project convention. Uses the workspace's
 * `node` environment because the package reads `process.env` at
 * import time.
 */
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
});
