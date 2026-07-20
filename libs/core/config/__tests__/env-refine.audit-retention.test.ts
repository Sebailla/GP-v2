import { describe, expect, it } from "vitest";

import { envSchema, productionEnvSchema, type Env } from "../env.schema";

/**
 * TDD contract for the M4 audit-retention env additions (task 1.3 RED).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §2 D8 +
 * `openspec/specs/audit-log-ui/spec.md` "Audit Retention Environment
 * Variable" requirement, the env contract MUST:
 *   - Expose `AUDIT_RETENTION_DAYS` as a non-negative integer.
 *       - Unset / missing → defaults to 90.
 *       - `0` is VALID (the kill-switch — no automatic purge).
 *       - `-1` is REJECTED (Zod min(0)).
 *       - Non-numeric strings (`"abc"`) are REJECTED (coerce.number
 *         yields NaN and fails the int refinement).
 *       - String forms (`"30"`, `"90"`) MUST be coerced to numbers.
 *   - Expose `AUDIT_RETENTION_ENABLED` as a boolean.
 *       - Unset / missing → defaults to `false` (opt-in retention cron).
 *       - `true` / `"true"` parse as `true`.
 *       - `false` / `"false"` parse as `false`.
 *
 * These five permutations (`0`, `30`, `90`, `-1`, `abc`) cover the
 * threat-matrix "Configuration" boundary per design §7. The
 * boolean pair (`true`, `false`) covers the opt-in gate per D2.
 *
 * Mirrors the file-layout / fixture pattern of `env-refine.test.ts`
 * (D7 Gmail contract) and `env.test.ts` so all three env suites stay
 * in lock-step on the env contract.
 */

const baseEnv: Env = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
  JWT_SECRET: "jwt-secret-at-least-thirty-two-characters-long",
  COOKIE_SECRET: "cookie-secret-at-least-thirty-two-characters-long",
  PUBLIC_WEB_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:3001",
  API_URL: "http://localhost:3001",
  GOOGLE_CLIENT_ID: "google-client-id-stub",
  GOOGLE_CLIENT_SECRET: "google-client-secret-stub",
  WEB_ORIGIN: "http://localhost:3000",
  MAIL_DSN: "smtp://user:pass@smtp.gmail.com:587",
  BACKUP_DSN: "s3://access:secret@bucket",
  METRICS_TOKEN: "metrics-token-at-least-sixteen-chars",
  STATUS_DETAIL_TOKEN: "status-detail-token-at-least-sixteen",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-at-least-sixteen-chars",
  LOG_LEVEL: "info",
  PORT: 3001,
  NODE_ENV: "test",
};

describe("envSchema — AUDIT_RETENTION_DAYS (M4 task 1.3 RED)", () => {
  it("defaults to 90 when unset (spec: 'Default 90')", () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_DAYS).toBe(90);
  });

  it("accepts 0 as the kill-switch (spec: 'Kill-switch 0')", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_DAYS: 0,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_DAYS).toBe(0);
  });

  it("accepts 30 as an explicit retention window (spec: 'Explicit 30')", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_DAYS: 30,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_DAYS).toBe(30);
  });

  it("coerces the string form '30' to the number 30", () => {
    // The env schema MUST accept both number AND string forms because
    // env loaders (dotenv, kubernetes ConfigMap, etc.) may deliver
    // either. `z.coerce.number().int().min(0)` handles both.
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_DAYS: "30",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_DAYS).toBe(30);
  });

  it("rejects -1 as a Zod error (spec: 'Invalid negative')", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_DAYS: -1,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("AUDIT_RETENTION_DAYS");
  });

  it("rejects 'abc' as a Zod error (spec: 'Invalid non-numeric')", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_DAYS: "abc",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("AUDIT_RETENTION_DAYS");
  });

  it("accepts a very large positive integer (e.g. 3650 — the 10-year ceiling)", () => {
    // The schema uses `min(0)` with no `max` — operators can dial the
    // window up or down. 3650 days = 10 years is a sane upper bound
    // for sanity-check coverage; the test pins no upper bound on the
    // schema.
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_DAYS: 3650,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_DAYS).toBe(3650);
  });
});

describe("envSchema — AUDIT_RETENTION_ENABLED (M4 task 1.3 RED, D2 opt-in gate)", () => {
  it("defaults to false when unset (opt-in retention cron, D2)", () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_ENABLED).toBe(false);
  });

  it("accepts the string form 'true' → true", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_ENABLED: "true",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_ENABLED).toBe(true);
  });

  it("accepts the string form 'false' → false", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      AUDIT_RETENTION_ENABLED: "false",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.AUDIT_RETENTION_ENABLED).toBe(false);
  });
});

describe("productionEnvSchema — AUDIT_RETENTION_DAYS surface to consumers", () => {
  it("exposes AUDIT_RETENTION_DAYS = 0 (kill-switch) on the parsed env", () => {
    const env = productionEnvSchema.parse({
      ...baseEnv,
      NODE_ENV: "production",
      AUDIT_RETENTION_DAYS: 0,
    });
    expect(env.AUDIT_RETENTION_DAYS).toBe(0);
  });

  it("exposes AUDIT_RETENTION_ENABLED = true when explicitly opted in", () => {
    const env = productionEnvSchema.parse({
      ...baseEnv,
      NODE_ENV: "production",
      AUDIT_RETENTION_ENABLED: "true",
    });
    expect(env.AUDIT_RETENTION_ENABLED).toBe(true);
  });
});
