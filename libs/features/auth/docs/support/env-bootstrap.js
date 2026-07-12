/**
 * Env bootstrap for the auth slice BDD runner (PR-7).
 *
 * Side-effect module imported by `support/register.ts` (cucumber's
 * `--require` hook) BEFORE any other import that transitively reaches
 * `@core/config`. The auth + transactions services validate
 * `process.env` at import time (Zod schema in `env.ts`); a missing
 * `NEXTAUTH_SECRET` etc. would throw and prevent the support
 * bridge from loading.
 *
 * Values are dev/test-only sentinels. They are NOT used in any
 * production code path — the BDD runner is a sandbox.
 */
const SENTINELS = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "test-secret-32-chars-minimum-aaaaaaaa",
  API_URL: "http://localhost:3001",
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test",
};

for (const [key, value] of Object.entries(SENTINELS)) {
  if (process.env[key] === undefined || process.env[key] === "") {
    process.env[key] = value;
  }
}
