import { describe, expect, it } from "vitest";

import { parseEnv, productionEnvSchema } from "../env.schema";

/**
 * D7 (Gmail env contract) — RED → GREEN → REFACTOR contract.
 *
 * `productionEnvSchema.superRefine` MUST enforce
 *   `GMAIL_USER` + `GMAIL_APP_PASSWORD` are present
 * ONLY when
 *   `NODE_ENV === "production"` AND `MAIL_DSN` is unset.
 *
 * The kill-switch `MAIL_DSN=console://` (D3) short-circuits the
 * Gmail requirement even in production: forcing operators to
 * populate Gmail credentials when they intentionally fall back
 * to the console adapter would defeat the kill-switch and turn
 * a defensive default into a footgun.
 *
 * These four permutations are the spec scenarios from
 * `openspec/specs/mail-adapter-port/spec.md` plus
 * `openspec/changes/module-2-public-auth/design.md` \u00a77 (Threat
 * Matrix \u2192 Configuration row). RED writes the assertions first;
 * GREEN implements the superRefine (task 2.2).
 *
 * We deliberately use the SAME base fixture as `env.test.ts` so the
 * two test files stay in lock-step on the env contract.
 */
const baseEnv = {
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
  // MAIL_DSN omitted by default; specific scenarios override it.
  BACKUP_DSN: "s3://access:secret@bucket",
  METRICS_TOKEN: "metrics-token-at-least-sixteen-chars",
  STATUS_DETAIL_TOKEN: "status-detail-token-at-least-sixteen",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-at-least-sixteen-chars",
  LOG_LEVEL: "info",
  PORT: 3001,
};

describe("productionEnvSchema \u2014 D7 Gmail env contract (module-2-public-auth)", () => {
  it("accepts production + no MAIL_DSN + Gmail env present", () => {
    const result = productionEnvSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: undefined,
      GMAIL_USER: "alerts@example.com",
      GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    });
    expect(result.success).toBe(true);
  });

  it("rejects production + no MAIL_DSN + Gmail env missing (ZodError)", () => {
    const result = productionEnvSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: undefined,
      // GMAIL_USER + GMAIL_APP_PASSWORD intentionally omitted
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("GMAIL_USER");
    expect(paths).toContain("GMAIL_APP_PASSWORD");
  });

  it("accepts development + Gmail env missing (kill-switch friendly)", () => {
    const result = productionEnvSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "development",
      MAIL_DSN: undefined,
      // Gmail env intentionally omitted
    });
    expect(result.success).toBe(true);
  });

  it("accepts production + MAIL_DSN set \u2192 Gmail env irrelevant (D3 kill-switch)", () => {
    const result = productionEnvSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: "smtp://user:pass@smtp.gmail.com:587",
      // Gmail env intentionally omitted
    });
    expect(result.success).toBe(true);
  });
});

describe("parseEnv \u2014 GMAIL_USER + GMAIL_APP_PASSWORD surface to consumers", () => {
  it("exposes GMAIL_USER and GMAIL_APP_PASSWORD when both are set", () => {
    const env = parseEnv({
      ...baseEnv,
      NODE_ENV: "production",
      GMAIL_USER: "alerts@example.com",
      GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    });
    expect(env.GMAIL_USER).toBe("alerts@example.com");
    expect(env.GMAIL_APP_PASSWORD).toBe("abcdefghijklmnop");
  });
});
