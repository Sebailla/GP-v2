import { defineConfig } from "vitest/config";

/**
 * Vitest config for @core/events. Tests live under src/__tests__/ per
 * the project's libs convention. Uses the `node` environment
 * because the dispatcher is purely in-memory but TypeScript tests
 * rely on Node's globals.
 */
export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
});
