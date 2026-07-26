import { describe, expect, it } from "vitest";

import { envSchema } from "../../../libs/core/config/env.schema";

const baseEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
  JWT_SECRET: "jwt-secret-at-least-thirty-two-characters-long",
  COOKIE_SECRET: "cookie-secret-at-least-thirty-two-characters-long",
  PUBLIC_WEB_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:3001",
  API_URL: "http://localhost:3001",
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test" as const,
};

describe("BCRYPT_COST_FACTOR_OVERRIDE", () => {
  it.each(["12", "14", "4"])("parses valid override %s as a number", (override) => {
    const result = envSchema.safeParse({ ...baseEnv, BCRYPT_COST_FACTOR_OVERRIDE: override });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.BCRYPT_COST_FACTOR_OVERRIDE).toBe(Number(override));
  });

  it.each(["0", "-1", "3", "abc"])("rejects invalid override %s", (override) => {
    const result = envSchema.safeParse({ ...baseEnv, BCRYPT_COST_FACTOR_OVERRIDE: override });

    expect(result.success).toBe(false);
  });
});
