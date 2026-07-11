import { describe, it, expect, vi } from "vitest";

import { toDecimal } from "@shared-utils/decimal";

import type { Transaction } from "../domain/entities/transaction.entity.js";
import { ThresholdService } from "../domain/services/threshold.service.js";
import { TRANSACTIONS_THRESHOLD_EXCEEDED } from "@core/events";

/**
 * TDD contract for `ThresholdService.evaluate` (slice 5 PR #3a — T5.9).
 *
 * The service is pure: takes a transaction, compares the amount
 * against a threshold, dispatches `transactions.threshold.exceeded`
 * if crossed, returns `true`/`false` accordingly. The controller
 * (PR #3b) calls this AFTER `TransactionService.create` returns.
 */

function fakeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    amount: toDecimal("100"),
    currencyCode: "USD",
    kind: "expense",
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

function makeService(thresholdStr: string) {
  const events = vi.fn().mockResolvedValue(undefined);
  const service = new ThresholdService({ amount: toDecimal(thresholdStr) }, events);
  return { service, events };
}

describe("ThresholdService.evaluate", () => {
  it("returns false and does NOT dispatch when the amount is below the threshold", async () => {
    const { service, events } = makeService("1000");
    const crossed = await service.evaluate(fakeTxn({ amount: toDecimal("999.99") }));

    expect(crossed).toBe(false);
    expect(events).not.toHaveBeenCalled();
  });

  it("returns true and dispatches when the amount equals the threshold", async () => {
    const { service, events } = makeService("1000");
    const crossed = await service.evaluate(fakeTxn({ amount: toDecimal("1000") }));

    expect(crossed).toBe(true);
    expect(events).toHaveBeenCalledTimes(1);
    const callArg = (
      events.mock.calls[0] as unknown as [{ name: string; payload: Record<string, unknown> }]
    )[0];
    expect(callArg.name).toBe(TRANSACTIONS_THRESHOLD_EXCEEDED);
    expect(callArg.payload.threshold).toBe("1000");
    expect(callArg.payload.total).toBe("1000");
  });

  it("returns true and dispatches when the amount exceeds the threshold", async () => {
    const { service, events } = makeService("1000");
    const crossed = await service.evaluate(fakeTxn({ amount: toDecimal("1500") }));

    expect(crossed).toBe(true);
    expect(events).toHaveBeenCalledTimes(1);
    const callArg = (
      events.mock.calls[0] as unknown as [{ payload: { userId: string; categoryId: string } }]
    )[0];
    expect(callArg.payload.userId).toBe("user-1");
    expect(callArg.payload.categoryId).toBe("cat-1");
  });

  it("dispatches the event name from @core/events (the source of truth)", async () => {
    const { service, events } = makeService("100");
    await service.evaluate(fakeTxn({ amount: toDecimal("200") }));

    const callArg = (events.mock.calls[0] as unknown as [{ name: string }])[0];
    // Locks the contract: the event name is `transactions.threshold.exceeded`,
    // not a hard-coded string. If the catalog in @core/events renames the
    // event, the service + this test update together.
    expect(callArg.name).toBe("transactions.threshold.exceeded");
  });
});
