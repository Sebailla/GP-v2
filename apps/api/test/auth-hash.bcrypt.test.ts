import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { envSchema } from "../../../libs/core/config/env.schema";
import { BCRYPT_COST_FACTOR } from "../../../libs/features/auth/server/src/constants";

const bcryptCostFromHash = (hash: string): number => Number(hash.split("$")[2]);

const resolveBcryptCost = (override?: unknown): number => {
  const parsed = envSchema.parse({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
    JWT_SECRET: "jwt-secret-at-least-thirty-two-characters-long",
    COOKIE_SECRET: "cookie-secret-at-least-thirty-two-characters-long",
    PUBLIC_WEB_URL: "http://localhost:3000",
    PUBLIC_API_URL: "http://localhost:3001",
    API_URL: "http://localhost:3001",
    WEB_ORIGIN: "http://localhost:3000",
    NODE_ENV: "test",
    BCRYPT_COST_FACTOR_OVERRIDE: override,
  });
  return parsed.BCRYPT_COST_FACTOR_OVERRIDE ?? BCRYPT_COST_FACTOR;
};

describe("bcrypt cost contract", () => {
  it("uses cost 12 by default", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", resolveBcryptCost());

    expect(bcryptCostFromHash(hash)).toBe(12);
  });

  it("hashes cost 12 within 1500ms in the instrumented harness", async () => {
    if (process.env.TURBO_HASH) return;

    const startedAt = performance.now();
    await bcrypt.hash("focused timing probe", resolveBcryptCost());
    const elapsed = performance.now() - startedAt;

    console.log("bcrypt cost-12:", elapsed, "ms");
    expect(elapsed).toBeLessThan(1_500);
  });

  it("uses an explicit cost 14 override", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", resolveBcryptCost("14"));

    expect(bcryptCostFromHash(hash)).toBe(14);
  }, 5_000);

  it("allows test mode to force cost 4", async () => {
    const hash = await bcrypt.hash("correct horse battery staple", resolveBcryptCost("4"));

    expect(bcryptCostFromHash(hash)).toBe(4);
  });

  it("hashes ten test passwords with cost 4 in under two seconds", async () => {
    const startedAt = performance.now();
    const hashes = await Promise.all(
      Array.from({ length: 10 }, (_, index) => bcrypt.hash(`test-password-${index}`, resolveBcryptCost("4"))),
    );

    expect(hashes).toHaveLength(10);
    expect(hashes.every((hash) => bcryptCostFromHash(hash) === 4)).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});
