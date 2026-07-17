import { defineConfig } from "vitest/config";

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
 */
export default defineConfig({
  // Module-2 PR #3 (task 3.4): the AuthController's constructor
  // declares `@Inject(MAIL_ADAPTER) private readonly mailAdapter:
  // MailAdapter` and `@Inject(AUTH_DISPATCHER) private readonly
  // dispatcher: InMemoryDispatcher`. Both `MailAdapter` and
  // `InMemoryDispatcher` are TYPE-only imports — the v8/TS
  // emit must preserve `design:paramtypes` so NestJS's reflector
  // can resolve the explicit injection tokens. Vite/esbuild's
  // default decorator transform does NOT emit this metadata; we
  // enable it explicitly here.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
      },
    },
  },
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
    ],
    environment: "node",
    globals: false,
    clearMocks: true,
    setupFiles: ["./test/setup-env.ts"],
  },
});
