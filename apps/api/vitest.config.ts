import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for apps/api (slice 3 batch 6 — T3.6 NestJS wrapper).
 *
 * Tests cover the NestJS e2e surface via
 * `Test.createTestingModule(...)` + supertest. The `test/` folder is
 * the canonical location; `src/` hosts the production code that the
 * tests exercise.
 *
 * Slice 3 batch 7 (T3.3) — added the `setupFiles` hook. The
 * `test/setup-env.ts` file sets the process.env values that
 * `@core/config/env.schema.ts` requires BEFORE any test module
 * loads. This is critical because the Zod schema parses
 * `process.env` at import time (via `parseEnv(process.env)` in
 * `env.ts`); without the setup hook, the import chain that pulls
 * in `AuthModule → @features/auth → @core/database → @core/config`
 * throws a ZodError at module load and every test fails for the
 * wrong reason.
 *
 * The setup uses TEST-ONLY placeholder values. The prisma singleton
 * is `vi.mock`ed in each test file (no real DB connection), and
 * tests mint NextAuth JWTs with the same `NEXTAUTH_SECRET` literal
 * via `next-auth/jwt#encode`.
 *
 * M3 (module-3-superadmin — PR #3 task 3.2): the `resolve.alias`
 * block maps `@features/auth/shared/schemas` to the canonical
 * shared schemas barrel (mirrors the apps/web vitest config). The
 * `@features/auth` package.json `exports` field exposes only `.`,
 * so without this alias the API e2e cannot import the admin
 * schemas from the controller (the imports resolve at vitest's
 * module layer, not via the apps/api tsconfig paths).
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@features\/auth\/shared\/schemas$/,
        replacement: path.resolve(
          __dirname,
          "../../libs/features/auth/shared/schemas/index.ts",
        ),
      },
    ],
  },
  // M4 (module-4-privacy) — the audit-retention cron (`@Cron(...)`)
// class lives in `apps/api/src/modules/auth/audit-retention.schedule.ts`
// (where the apps/api tsconfig's `experimentalDecorators: true` lets
// Vite SSR transform the decorator cleanly) — not in
// `libs/features/auth/` (whose tsconfig lacks the flag). No vitest
// config override is needed because the cron class lives in a path
// where the decorator is parseable.
  test: {
    include: [
      "test/**/*.spec.ts",
      "test/**/*.test.ts",
      "test/**/*.e2e-spec.ts",
      // PR #2 (module-2-public-auth) — mail adapter tests live alongside
      // the production code under `src/mail/__tests__/`. The pattern is
      // `**/*.test.ts` so any future src-side unit test (e.g.
      // `src/auth/__tests__/*`) is picked up automatically.
      "src/**/*.test.ts",
      // M3 (module-3-superadmin — PR #3 task 3.3): guard unit tests
      // alongside production code use the `*.spec.ts` suffix (matching
      // the `test/*.spec.ts` e2e convention). Widening the glob so the
      // AdminGuard test is picked up automatically without renaming.
      "src/**/*.spec.ts",
    ],
    environment: "node",
    globals: false,
    clearMocks: true,
    setupFiles: ["./test/setup-env.ts"],
    // M5 D4 — per-package coverage threshold (60% on lines,
    // branches, functions, statements). The threshold matches
    // `openspec/config.yaml#coverage_threshold` and the
    // observability spec's "Coverage Gate Enforcement"
    // requirement. The turbo `coverage` task is the canonical
    // runner; the opt-out escape `coverage.disabled=true` is
    // wired in `turbo.json#coverage.env` so operators can
    // disable the gate for experimental branches (see D4 +
    // observability spec "Coverage opt-out" scenario).
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
