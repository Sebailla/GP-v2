import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest config for workspace-level scripts (R-PF-7 backup job).
 * Lives under `scripts/` so vitest's standard config-resolution
 * walks into it only when running scripts tests. Path aliases
 * mirror `tsconfig.base.json#paths` so the script tests can
 * `import { prisma } from "@core/database"`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@core/database": resolve(__dirname, "../libs/core/database/src"),
      "@core/database/generated/client": resolve(
        __dirname,
        "../libs/core/database/src/generated/client.ts",
      ),
      "@core/events": resolve(__dirname, "../libs/core/events/src"),
      "@core/config": resolve(__dirname, "../libs/core/config"),
      "@core/logging": resolve(__dirname, "../libs/core/logging/src"),
      "@core/rate-limit": resolve(__dirname, "../libs/core/rate-limit/src"),
    },
  },
  test: {
    include: ["operations/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
});