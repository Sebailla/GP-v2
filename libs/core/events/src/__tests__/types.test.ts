import { describe, expect, it } from "vitest";

import {
  EVENT_NAMES,
  authPasswordResetCompletedPayload,
  authPasswordResetRequestedPayload,
  authRbacDeniedPayload,
  authSessionRevokedPayload,
  transactionsCreatedPayload,
  transactionsFxStalePayload,
  transactionsSoftDeletedPayload,
  transactionsThresholdExceededPayload,
  transactionsUpdatedPayload,
  validatePayload,
} from "../types";

/**
 * TDD contract for the events type catalog (T2.3 — 9 events).
 *
 *  - RED:    EVENT_NAMES contains all 9 expected names; each per-event
 *            Zod schema rejects a malformed payload.
 *  - GREEN:  each schema accepts a well-formed payload of its type.
 *  - TRIANGULATE: validatePayload surfaces a descriptive error on
 *                 invalid input; the union of names is closed (no
 *                 other event name compiles).
 */

const ALL_NAMES = [
  "auth.password-reset.requested",
  "auth.password-reset.completed",
  "auth.session.revoked",
  "auth.rbac.denied",
  "transactions.created",
  "transactions.updated",
  "transactions.soft-deleted",
  "transactions.fx.stale",
  "transactions.threshold.exceeded",
] as const;

describe("EVENT_NAMES", () => {
  it("contains exactly the 9 expected domain event names", () => {
    expect(EVENT_NAMES).toHaveLength(9);
    for (const name of ALL_NAMES) {
      expect(EVENT_NAMES).toContain(name);
    }
  });
});

describe("auth.password-reset.requested", () => {
  it("accepts a well-formed payload", () => {
    const result = authPasswordResetRequestedPayload.safeParse({
      userId: "u1",
      token: "a".repeat(32),
      locale: "en",
      resetUrl: "http://localhost:3000/en/reset-password/" + "a".repeat(64),
      requestedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a token shorter than 32 chars", () => {
    const result = authPasswordResetRequestedPayload.safeParse({
      userId: "u1",
      token: "short",
      locale: "en",
      resetUrl: "http://localhost:3000/en/reset-password/short",
      requestedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown locale (closed enum: en|es)", () => {
    const result = authPasswordResetRequestedPayload.safeParse({
      userId: "u1",
      token: "a".repeat(32),
      locale: "fr",
      resetUrl: "http://localhost:3000/fr/reset-password/" + "a".repeat(64),
      requestedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed resetUrl", () => {
    const result = authPasswordResetRequestedPayload.safeParse({
      userId: "u1",
      token: "a".repeat(32),
      locale: "en",
      resetUrl: "not-a-url",
      requestedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts an ISO string for requestedAt and coerces to Date", () => {
    const result = authPasswordResetRequestedPayload.safeParse({
      userId: "u1",
      token: "a".repeat(32),
      locale: "en",
      resetUrl: "http://localhost:3000/en/reset-password/" + "a".repeat(64),
      requestedAt: "2026-07-05T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.requestedAt).toBeInstanceOf(Date);
  });
});

describe("auth.password-reset.completed", () => {
  it("accepts a well-formed payload", () => {
    const result = authPasswordResetCompletedPayload.safeParse({
      userId: "u1",
      resetAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects when userId is missing", () => {
    const result = authPasswordResetCompletedPayload.safeParse({
      resetAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("auth.session.revoked", () => {
  it("accepts a well-formed payload", () => {
    const result = authSessionRevokedPayload.safeParse({
      userId: "u1",
      sessionId: "s1",
      revokedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects when sessionId is missing", () => {
    const result = authSessionRevokedPayload.safeParse({
      userId: "u1",
      revokedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("auth.rbac.denied", () => {
  it("accepts a well-formed payload", () => {
    const result = authRbacDeniedPayload.safeParse({
      userId: "u1",
      action: "transaction:write",
      resourceType: "Transaction",
      at: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

describe("transactions.created", () => {
  it("accepts a well-formed payload", () => {
    const result = transactionsCreatedPayload.safeParse({
      transactionId: "t1",
      userId: "u1",
      amount: "10.00",
      currency: "USD",
      occurredAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-3-letter currency code", () => {
    const result = transactionsCreatedPayload.safeParse({
      transactionId: "t1",
      userId: "u1",
      amount: "10.00",
      currency: "US",
      occurredAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    const result = transactionsCreatedPayload.safeParse({
      transactionId: "t1",
      userId: "u1",
      amount: "ten",
      currency: "USD",
      occurredAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("transactions.updated", () => {
  it("accepts a well-formed payload", () => {
    const result = transactionsUpdatedPayload.safeParse({
      transactionId: "t1",
      userId: "u1",
      changedFields: ["amount", "categoryId"],
      at: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

describe("transactions.soft-deleted", () => {
  it("accepts a well-formed payload", () => {
    const result = transactionsSoftDeletedPayload.safeParse({
      transactionId: "t1",
      userId: "u1",
      at: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

describe("transactions.fx.stale", () => {
  it("accepts a well-formed payload", () => {
    const result = transactionsFxStalePayload.safeParse({
      from: "USD",
      to: "ARS",
      recordedAt: new Date(),
      observedAt: new Date(),
      ageHours: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative ageHours", () => {
    const result = transactionsFxStalePayload.safeParse({
      from: "USD",
      to: "ARS",
      recordedAt: new Date(),
      observedAt: new Date(),
      ageHours: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("transactions.threshold.exceeded", () => {
  it("accepts a well-formed payload", () => {
    const result = transactionsThresholdExceededPayload.safeParse({
      userId: "u1",
      categoryId: "c1",
      threshold: "1000.00",
      total: "1500.00",
      observedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

describe("validatePayload helper", () => {
  it("returns the parsed payload when valid", () => {
    const payload = {
      transactionId: "t1",
      userId: "u1",
      amount: "10.00",
      currency: "USD",
      occurredAt: new Date(),
    };
    const parsed = validatePayload("transactions.created", transactionsCreatedPayload, payload);
    expect(parsed.transactionId).toBe("t1");
  });

  it("throws a descriptive error when invalid", () => {
    expect(() =>
      validatePayload("transactions.created", transactionsCreatedPayload, {
        transactionId: "t1",
        userId: "u1",
        amount: "10.00",
        // missing currency and occurredAt
      }),
    ).toThrow(/transactions\.created/);
  });
});
