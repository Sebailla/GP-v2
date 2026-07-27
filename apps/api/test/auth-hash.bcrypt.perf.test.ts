import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

const shouldRunPerformanceProbe = process.env.BCRYPT_PERF_TEST === "1";

const productionBcryptCost = 12;
const productionTimingBudgetMs = 500;

describe.skipIf(!shouldRunPerformanceProbe)("bcrypt production performance", () => {
  it("hashes a cost-12 password within the production SLA", async () => {
    const startedAt = performance.now();
    const hash = await bcrypt.hash("production timing probe", productionBcryptCost);
    const elapsed = performance.now() - startedAt;

    expect(Number(hash.split("$")[2])).toBe(productionBcryptCost);
    expect(elapsed).toBeLessThanOrEqual(productionTimingBudgetMs);
  });
});
