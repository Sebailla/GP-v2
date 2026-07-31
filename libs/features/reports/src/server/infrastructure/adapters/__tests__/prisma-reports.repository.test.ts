import { PrismaClient } from "@core/database";
import { prisma as defaultPrisma } from "@core/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaReportsRepository } from "../prisma-reports.repository.js";

/**
 * Integration tests for `PrismaReportsRepository` against a real Postgres
 * connection.
 *
 * Requires `DATABASE_URL` to be set (the local Postgres container
 * brought up by `pnpm db:up` is the canonical target). The
 * `@core/database` Prisma client is wired with `@prisma/adapter-pg`
 * and connects to the real DB on first property access.
 *
 * The fixture rows in `beforeAll` use cuid-style ids prefixed with
 * `rdrts1_` so a parallel CI run does not collide with other
 * integration suites’ ids.
 */
const prisma = defaultPrisma;

const USER_A = "rdrts1_reports_prisma_user_a";
const USER_B = "rdrts1_reports_prisma_user_b";
const CATEGORY_ID = "rdrts1_reports_prisma_cat";
const CURRENCY_USD = "USD";

const adapter = new PrismaReportsRepository(prisma);

beforeAll(async () => {
  // Seed reference data — idempotent.
  await prisma.currency.upsert({
    where: { code: CURRENCY_USD },
    update: {},
    create: { code: CURRENCY_USD, name: "US Dollar", symbol: "$", decimals: 2 },
  });
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: "reports-prisma-user-a@test.local", role: "USER" },
  });
  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: "reports-prisma-user-b@test.local", role: "USER" },
  });
  await prisma.category.upsert({
    where: { id: CATEGORY_ID },
    update: {},
    create: {
      id: CATEGORY_ID,
      name: "Food",
      slug: "food-reports-prisma-test",
      kind: "expense",
      updatedBy: USER_A,
    },
  });

  await prisma.transaction.deleteMany({
    where: { createdBy: USER_A, notes: "prisma-reports-test" },
  });
  await prisma.userPreference.deleteMany({ where: { userId: USER_A } });

  await prisma.transaction.create({
    data: {
      id: "rdrts1_prisma_t1",
      amount: "100.00",
      currencyCode: CURRENCY_USD,
      kind: "income",
      categoryId: CATEGORY_ID,
      occurredAt: new Date("2026-07-15T12:00:00.000Z"),
      createdBy: USER_A,
      updatedBy: USER_A,
      notes: "prisma-reports-test",
    },
  });
  await prisma.transaction.create({
    data: {
      id: "rdrts1_prisma_t2",
      amount: "50.00",
      currencyCode: CURRENCY_USD,
      kind: "expense",
      categoryId: CATEGORY_ID,
      occurredAt: new Date("2026-07-20T08:00:00.000Z"),
      createdBy: USER_A,
      updatedBy: USER_A,
      notes: "prisma-reports-test",
    },
  });
  await prisma.transaction.create({
    data: {
      id: "rdrts1_prisma_t3_outofrange",
      amount: "999.00",
      currencyCode: CURRENCY_USD,
      kind: "income",
      categoryId: CATEGORY_ID,
      occurredAt: new Date("2026-12-15T12:00:00.000Z"),
      createdBy: USER_A,
      updatedBy: USER_A,
      notes: "prisma-reports-test",
    },
  });

  await prisma.userPreference.create({
    data: { userId: USER_A, primaryCurrencyCode: CURRENCY_USD },
  });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({
    where: { createdBy: USER_A, notes: "prisma-reports-test" },
  });
  await prisma.userPreference.deleteMany({ where: { userId: USER_A } });
});

describe("PrismaReportsRepository.findForUserInRange", () => {
  it("returns the user's transactions projected to TransactionForReport", async () => {
    const rows = await adapter.findForUserInRange(USER_A, {
      fromDate: "2026-07-01",
      toDate: "2026-08-01",
    });
    expect(rows).toHaveLength(2);
    const t1 = rows.find((r) => r.id === "rdrts1_prisma_t1");
    const t2 = rows.find((r) => r.id === "rdrts1_prisma_t2");
    expect(t1?.amount).toBe("100.00");
    expect(t2?.amount).toBe("-50.00");
    expect(t1?.categoryName).toBe("Food");
    expect(t2?.categoryName).toBe("Food");
    expect(t1?.currencyCode).toBe(CURRENCY_USD);
    expect(t1?.userId).toBe(USER_A);
  });

  it("enforces the half-open [fromDate, toDate) interval", async () => {
    const rows = await adapter.findForUserInRange(USER_A, {
      fromDate: "2026-07-01",
      toDate: "2026-07-15",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("rdrts1_prisma_t1");
  });

  it("filters cross-user: user B sees zero rows for user A's transactions", async () => {
    const rows = await adapter.findForUserInRange(USER_B, {
      fromDate: "2026-07-01",
      toDate: "2026-08-01",
    });
    expect(rows).toHaveLength(0);
  });

  it("returns an empty array for an inverted range", async () => {
    const rows = await adapter.findForUserInRange(USER_A, {
      fromDate: "2026-08-01",
      toDate: "2026-07-01",
    });
    expect(rows).toHaveLength(0);
  });
});

describe("PrismaReportsRepository.findPrimaryCurrencyForUser", () => {
  it("returns the configured primary currency code", async () => {
    const code = await adapter.findPrimaryCurrencyForUser(USER_A);
    expect(code).toBe(CURRENCY_USD);
  });

  it("returns null for a user without a preference row", async () => {
    const code = await adapter.findPrimaryCurrencyForUser(USER_B);
    expect(code).toBeNull();
  });
});
