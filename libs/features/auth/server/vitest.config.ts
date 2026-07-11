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
    // The Zod schemas live under libs/features/auth/shared/schemas/ (per
    // design §4.2 + ESLint rule `no-schemas-outside-shared`). Their unit
    // tests live alongside the schemas under shared/schemas/__tests__/;
    // the server package's vitest config picks both up so a single
    // `pnpm --filter @features/auth exec vitest run` discovers every
    // auth-slice test.
    include: ["src/__tests__/**/*.test.ts", "../shared/schemas/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
    // Slice 4 NextAuth integration follow-up — AuthService now mints
    // real NextAuth JWEs via @auth/core/jwt#encode, which reads
    // env.NEXTAUTH_SECRET at module-load time. The setup file mirrors
    // apps/api/test/setup-env.ts so the auth-feature + the API agree
    // on the same secret (the guard's decode uses the same string).
    setupFiles: ["./vitest.setup.ts"],
  },
});
