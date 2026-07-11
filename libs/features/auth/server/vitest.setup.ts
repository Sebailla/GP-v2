/**
 * Vitest setup file for @features/auth tests.
 *
 * Runs BEFORE any test module loads. Sets the process.env values that
 * the @core/config Zod schema requires (DATABASE_URL, NEXTAUTH_URL,
 * NEXTAUTH_SECRET, API_URL, WEB_ORIGIN, NODE_ENV) so the
 * `parseEnv(process.env)` call at `libs/core/config/env.ts:12`
 * succeeds when the AuthService import chain pulls in `@core/config`
 * (slice 4 NextAuth integration follow-up — AuthService now mints a
 * real NextAuth JWE via `@auth/core/jwt#encode`, which reads
 * `env.NEXTAUTH_SECRET`).
 *
 * The setup values mirror the apps/api e2e harness (`apps/api/test/setup-env.ts`)
 * so the API + the feature lib agree on the same `NEXTAUTH_SECRET`
 * + `NEXTAUTH_URL` (the guard's `decode` call uses the same string
 * the encoder reads here). The values are TEST-ONLY placeholders;
 * the @core/database singleton is `vi.mock`ed per test file.
 *
 * Wired via `vitest.config.ts#setupFiles` so the env is available at
 * module-load time (earlier than `beforeEach`).
 */
const env = process.env as Record<string, string>;
env["NODE_ENV"] = "test";
env["PORT"] = "3001";
env["API_URL"] = "http://localhost:3001";
env["WEB_ORIGIN"] = "http://localhost:3000";
env["DATABASE_URL"] = "postgresql://placeholder@localhost:5432/db";
env["NEXTAUTH_URL"] = "http://localhost:3000";
env["NEXTAUTH_SECRET"] = "test-secret-at-least-32-characters-long-for-hkdf";
