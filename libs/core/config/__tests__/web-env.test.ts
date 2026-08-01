import { describe, expect, it } from "vitest";

import { parseWebEnv, type WebEnv, webEnvSchema } from "../web-env.schema";

/**
 * TDD contract for `@core/config/web-env.schema` — the v1.4.1 build
 * env-validation fix.
 *
 * The web app (`apps/web`) only consumes a small slice of the full
 * `@core/config` env surface (NEXTAUTH_URL / NEXTAUTH_SECRET / JWT_SECRET
 * / COOKIE_SECRET / PUBLIC_WEB_URL / PUBLIC_API_URL / API_URL /
 * WEB_ORIGIN / NODE_ENV, plus a few optional fields). The full schema
 * in `env.schema.ts` requires the API's prod-only fields
 * (BACKUP_DSN, METRICS_TOKEN, UPSTASH_REDIS_REST_*, GMAIL_*) which the
 * web build drags into its module graph at `next build` time, causing
 * the production build to fail in clean dev environments.
 *
 * The fix is a schema split: this new `webEnvSchema` is the canonical
 * web env contract. The full API schema stays intact (the API still
 * fail-fasts at startup on the prod-only fields).
 *
 *  - RED:     the schema accepts a complete web env and rejects the
 *             prod-only fields as "not part of WebEnv" (compile-time).
 *  - GREEN:   parseWebEnv succeeds with a minimal web env fixture; the
 *             prod-only fields are NOT in WebEnv (negative type check).
 *  - TRIANGULATE: parseWebEnv rejects malformed URLs + missing
 *                 required fields.
 */
describe("@core/config/web-env.schema — v1.4.1 web-only env split", () => {
  const validFixture: WebEnv = {
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
    JWT_SECRET: "jwt-secret-at-least-thirty-two-characters-long",
    COOKIE_SECRET: "cookie-secret-at-least-thirty-two-characters-long",
    PUBLIC_WEB_URL: "http://localhost:3000",
    PUBLIC_API_URL: "http://localhost:3001",
    API_URL: "http://localhost:3001",
    WEB_ORIGIN: "http://localhost:3000",
    NODE_ENV: "development",
  };

  it("exposes the webEnvSchema + parseWebEnv + WebEnv contract", () => {
    expect(webEnvSchema).toBeDefined();
    expect(parseWebEnv).toBeTypeOf("function");
  });

  it("parses a complete web env (GREEN)", () => {
    const parsed = parseWebEnv(validFixture);
    expect(parsed.NEXTAUTH_URL).toBe("http://localhost:3000");
    expect(parsed.NEXTAUTH_SECRET).toBe(
      "a-very-long-secret-of-at-least-thirty-two-characters",
    );
    expect(parsed.NODE_ENV).toBe("development");
  });

  it("rejects a malformed URL (TRIANGULATE — shape validation)", () => {
    const result = webEnvSchema.safeParse({
      ...validFixture,
      NEXTAUTH_URL: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short NEXTAUTH_SECRET (TRIANGULATE — length validation)", () => {
    const result = webEnvSchema.safeParse({
      ...validFixture,
      NEXTAUTH_SECRET: "too-short",
    });
    expect(result.success).toBe(false);
  });

  it("does NOT include the API's prod-only fields in WebEnv (compile-time contract)", () => {
    // The TypeScript compiler enforces this via the `// @ts-expect-error`
    // comment below. If a future schema change accidentally adds
    // BACKUP_DSN to WebEnv, the @ts-expect-error becomes an unused
    // error and the test fails. This is the negative test that proves
    // the schema split is real.
    const parsed: WebEnv = parseWebEnv(validFixture);
    // @ts-expect-error BACKUP_DSN is not in WebEnv (it's API-only).
    const _backupDsn: string = parsed.BACKUP_DSN;
    // Reference the variable so the @ts-expect-error isn't flagged as
    // unused. The compiler will complain if BACKUP_DSN IS in WebEnv;
    // the test runner doesn't care about the runtime value.
    void _backupDsn;
    // Same for the other prod-only fields:
    // @ts-expect-error METRICS_TOKEN is not in WebEnv (it's API-only).
    const _metrics: string = parsed.METRICS_TOKEN;
    // @ts-expect-error GMAIL_USER is not in WebEnv (it's API-only).
    const _gmailUser: string = parsed.GMAIL_USER;
    // @ts-expect-error GMAIL_APP_PASSWORD is not in WebEnv (it's API-only).
    const _gmailPassword: string = parsed.GMAIL_APP_PASSWORD;
    // @ts-expect-error DATABASE_URL is not in WebEnv (the web doesn't connect to Postgres directly).
    const _db: string = parsed.DATABASE_URL;
    // @ts-expect-error MAIL_DSN is not in WebEnv (mail is API-only).
    const _mail: string = parsed.MAIL_DSN;
    // @ts-expect-error UPSTASH_REDIS_REST_URL is not in WebEnv (rate-limit backend is API-only).
    const _upstash: string = parsed.UPSTASH_REDIS_REST_URL;
    void _metrics;
    void _gmailUser;
    void _gmailPassword;
    void _db;
    void _mail;
    void _upstash;
  });

  it("accepts a web env with NODE_ENV=production (no prod-only fields required)", () => {
    // This is the assertion that the build env-validation fix cares
    // about: when NODE_ENV=production (Next.js build sets it), the
    // web schema must NOT require any of the API's prod-only fields.
    // The web build is runnable with only the web's env.
    const parsed = parseWebEnv({
      ...validFixture,
      NODE_ENV: "production",
    });
    expect(parsed.NODE_ENV).toBe("production");
  });
});
