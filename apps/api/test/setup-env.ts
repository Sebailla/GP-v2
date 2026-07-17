/**
 * Vitest setup file for apps/api e2e tests.
 *
 * Runs BEFORE any test module loads. Sets the process.env values that
 * the @core/config Zod schema requires (DATABASE_URL, NEXTAUTH_URL,
 * NEXTAUTH_SECRET, WEB_ORIGIN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * NODE_ENV) so the `parseEnv(process.env)` call at
 * `libs/core/config/env.ts:12` succeeds when the AuthModule import
 * chain pulls in `@core/config`.
 *
 * These values are TEST-ONLY placeholders. No real secrets, no real
 * database — the @core/database singleton is `vi.mock`ed in every
 * test file. The NEXTAUTH_SECRET is a 32+ char string (Zod's min
 * bound) so the schema parses; tests mint JWTs with this same
 * secret via `next-auth/jwt#encode`.
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
env["GOOGLE_CLIENT_ID"] = "test-google-client-id";
env["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret";
env["JWT_SECRET"] = "test-jwt-secret-at-least-32-characters-long";
env["COOKIE_SECRET"] = "test-cookie-secret-at-least-32-characters-long";
env["PUBLIC_WEB_URL"] = "http://localhost:3000";
env["PUBLIC_API_URL"] = "http://localhost:3001";
env["METRICS_TOKEN"] = "test-metrics-token-at-least-16";
env["STATUS_DETAIL_TOKEN"] = "test-status-detail-token-at-least-16";
env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
env["UPSTASH_REDIS_REST_TOKEN"] = "test-upstash-token-at-least-16-chars";
env["LOG_LEVEL"] = "info";
