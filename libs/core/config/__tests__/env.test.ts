import { describe, expect, it } from "vitest";

import { envSchema, parseEnv, type Env } from "../env.schema";

/**
 * TDD contract for @core/config:
 *
 *  - RED:    safeParse({}) MUST fail and the issues MUST mention every
 *            required field path.
 *  - GREEN:  safeParse with a complete, well-formed env object MUST succeed.
 *  - TRIANGULATE: coercion rules (PORT → number), defaults, shape
 *                 validation (URL for NEXTAUTH_URL / WEB_ORIGIN).
 *  - REFACTOR: parseEnv helper for test-time overrides + env singleton.
 *
 * We intentionally avoid importing the `env` singleton at the top of
 * the file because `env.ts` parses process.env at import time. We
 * test the schema directly here and exercise the singleton factory
 * via `parseEnv` instead.
 */

const completeFixture: Env = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
  GOOGLE_CLIENT_ID: "google-client-id-stub",
  GOOGLE_CLIENT_SECRET: "google-client-secret-stub",
  WEB_ORIGIN: "http://localhost:3000",
  PORT: 3001,
  NODE_ENV: "development",
};

describe("envSchema", () => {
  describe("safeParse with empty input (RED)", () => {
    const result = envSchema.safeParse({});

    it("returns success=false", () => {
      expect(result.success).toBe(false);
    });

    it("flags DATABASE_URL as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("DATABASE_URL");
    });

    it("flags NEXTAUTH_URL as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("NEXTAUTH_URL");
    });

    it("flags NEXTAUTH_SECRET as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("NEXTAUTH_SECRET");
    });

    it("flags GOOGLE_CLIENT_ID as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("GOOGLE_CLIENT_ID");
    });

    it("flags GOOGLE_CLIENT_SECRET as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("GOOGLE_CLIENT_SECRET");
    });

    it("flags WEB_ORIGIN as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("WEB_ORIGIN");
    });

    it("flags NODE_ENV as a required field", () => {
      expect(result.success).toBe(false);
      if (result.success) return;
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("NODE_ENV");
    });
  });

  describe("safeParse with a complete, well-formed env (GREEN)", () => {
    const complete = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
      GOOGLE_CLIENT_ID: "google-client-id-stub",
      GOOGLE_CLIENT_SECRET: "google-client-secret-stub",
      WEB_ORIGIN: "http://localhost:3000",
      NODE_ENV: "development",
    };

    it("returns success=true", () => {
      const result = envSchema.safeParse(complete);
      expect(result.success).toBe(true);
    });

    it("preserves the parsed values as-is when no transformation applies", () => {
      const result = envSchema.safeParse(complete);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.DATABASE_URL).toBe(complete.DATABASE_URL);
      expect(result.data.NEXTAUTH_URL).toBe(complete.NEXTAUTH_URL);
      expect(result.data.NODE_ENV).toBe("development");
    });
  });

  describe("TRIANGULATE — coercion, defaults, and shape rules", () => {
    const base = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
      GOOGLE_CLIENT_ID: "google-client-id-stub",
      GOOGLE_CLIENT_SECRET: "google-client-secret-stub",
      WEB_ORIGIN: "http://localhost:3000",
      NODE_ENV: "production",
    };

    it("defaults PORT to 3001 when omitted", () => {
      const result = envSchema.safeParse(base);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.PORT).toBe(3001);
    });

    it("coerces PORT string to number when provided", () => {
      const result = envSchema.safeParse({ ...base, PORT: "4242" });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.PORT).toBe(4242);
      expect(typeof result.data.PORT).toBe("number");
    });

    it("rejects a malformed DATABASE_URL", () => {
      const result = envSchema.safeParse({ ...base, DATABASE_URL: "not-a-url" });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown NODE_ENV value", () => {
      const result = envSchema.safeParse({ ...base, NODE_ENV: "staging-ish" });
      expect(result.success).toBe(false);
    });

    it("accepts NODE_ENV in {development, test, production}", () => {
      for (const env of ["development", "test", "production"] as const) {
        const result = envSchema.safeParse({ ...base, NODE_ENV: env });
        expect(result.success).toBe(true);
      }
    });
  });
});

describe("parseEnv", () => {
  it("returns a fully-typed Env when given a complete record", () => {
    const env = parseEnv(completeFixture);
    expect(env.DATABASE_URL).toBe(completeFixture.DATABASE_URL);
    expect(env.PORT).toBe(completeFixture.PORT);
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws a ZodError when a required field is missing", () => {
    const { DATABASE_URL: _drop, ...rest } = completeFixture;
    expect(() => parseEnv(rest)).toThrow();
  });

  it("respects PORT override via test-time injection", () => {
    const override: Env = { ...completeFixture, PORT: 9999 };
    const env = parseEnv(override);
    expect(env.PORT).toBe(9999);
  });
});