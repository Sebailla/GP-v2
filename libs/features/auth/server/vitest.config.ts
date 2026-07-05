import { defineConfig } from "vitest/config";

/**
 * Vitest config for @features/auth.
 *
 * Tests live under src/__tests__/ per the project's libs convention.
 * Uses the `node` environment because AuthService interacts with
 * Prisma (mocked) and bcryptjs (mocked) at runtime.
 */
export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
});