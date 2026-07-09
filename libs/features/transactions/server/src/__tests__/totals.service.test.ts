import { describe, it, expect, vi } from "vitest";

import { toDecimal } from "@shared-utils/decimal";

import type { Transaction, TransactionKind } from "../domain/entities/transaction.entity.js";
import type { TransactionRepository } from "../domain/interfaces/transaction.repository.js";
import { TotalsService } from "../domain/services/totals.service.js";

/**
 * TDD contract for `TotalsService` (slice 5 PR #3a — T5.9).
 *
 * The service is pure aggregation logic over the
 * `TransactionRepository.findManyForUser` result set. The repository
 * is mocked; the service-level tests assert the sign-aware + per-
 * category math. D-TX-5 (soft-delete filter) is enforced at the
 * boundary; the service trusts the filtered set.
 */

function fakeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    amount: toDecimal("12.34"),
    currencyCode: "USD",
    kind: "expense" as TransactionKind,
    reportingAmount: null,
    reportingCurrencyCode: null,
    fxRateId: null,
    categoryId: "cat-1",
    notes: null,
    occurredAt: new Date("2026-06-01T12:00:00.000Z"),
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeService(rows: Transaction[]) {
  const findManyForUser = vi.fn().mockResolvedValue(rows);
  const txRepo: TransactionRepository = {
    findByIdForUser: vi.fn().mockResolvedValue(null),
    findByIdForUserIncludingDeleted: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ rows: [], total: 0, cursor: null }),
    create: vi.fn().mockResolvedValue(rows[0] ?? fakeTxn()),
    update: vi.fn().mockResolvedValue(rows[0] ?? fakeTxn()),
    softDelete: vi.fn().mockResolvedValue(undefined),
    findManyForUser,
  };
  const service = new TotalsService(txRepo);
  return { service, findManyForUser };
}

describe("TotalsService", () => {
  describe("forUser", () => {
    it("returns zero totals when the user has no transactions", async () => {
      const { service } = makeService([]);

      const totals = await service.forUser("user-1");

      expect(totals.income.toString()).toBe("0");
      expect(totals.expense.toString()).toBe("0");
      expect(totals.net.toString()).toBe("0");
    });

    it("sums income and expense separately with sign-aware net (income - expense)", async () => {
      const { service } = makeService([
        fakeTxn({ id: "txn-1", amount: toDecimal("100.00"), kind: "income" }),
        fakeTxn({ id: "txn-2", amount: toDecimal("30.50"), kind: "expense" }),
        fakeTxn({ id: "txn-3", amount: toDecimal("20.00"), kind: "income" }),
        fakeTxn({ id: "txn-4", amount: toDecimal("5.25"), kind: "expense" }),
      ]);

      const totals = await service.forUser("user-1");

      expect(totals.income.toString()).toBe("120"); // 100 + 20
      expect(totals.expense.toString()).toBe("35.75"); // 30.50 + 5.25
      expect(totals.net.toString()).toBe("84.25"); // 120 - 35.75
    });

    it("queries the repository with the userId + range", async () => {
      const { service, findManyForUser } = makeService([]);
      const range = {
        fromDate: new Date("2026-06-01T00:00:00.000Z"),
        toDate: new Date("2026-07-01T00:00:00.000Z"),
      };
      await service.forUser("user-1", range);

      expect(findManyForUser).toHaveBeenCalledWith("user-1", range);
    });
  });

  describe("perCategory", () => {
    it("returns one entry per active category, sorted by categoryId", async () => {
      const { service } = makeService([
        fakeTxn({ id: "txn-1", categoryId: "cat-2", amount: toDecimal("50"), kind: "expense" }),
        fakeTxn({ id: "txn-2", categoryId: "cat-1", amount: toDecimal("100"), kind: "income" }),
        fakeTxn({ id: "txn-3", categoryId: "cat-1", amount: toDecimal("20"), kind: "income" }),
      ]);

      const totals = await service.perCategory("user-1");

      expect(totals).toHaveLength(2);
      // Sorted by categoryId ascending: cat-1, cat-2.
      expect(totals[0]!.categoryId).toBe("cat-1");
      expect(totals[0]!.total.toString()).toBe("120"); // 100 + 20
      expect(totals[0]!.kind).toBe("income");
      expect(totals[1]!.categoryId).toBe("cat-2");
      expect(totals[1]!.total.toString()).toBe("50");
      expect(totals[1]!.kind).toBe("expense");
    });

    it("returns an empty array when the user has no transactions", async () => {
      const { service } = makeService([]);
      const totals = await service.perCategory("user-1");
      expect(totals).toEqual([]);
    });
  });
});