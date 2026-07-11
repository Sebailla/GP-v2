import { describe, it, expect } from "vitest";
import { createSchema } from "../create.js";

describe("createSchema (POST /transactions)", () => {
  it("accepts a well-formed payload and coerces occurredAt to Date", () => {
    const result = createSchema.parse({
      amount: "100.5",
      currencyCode: "USD",
      kind: "expense",
      categoryId: "ckl5g8z3a0001abcd1234ef",
      notes: "lunch",
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    expect(result.amount).toBe("100.5");
    expect(result.kind).toBe("expense");
    expect(result.notes).toBe("lunch");
    expect(result.occurredAt).toBeInstanceOf(Date);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      createSchema.parse({
        amount: "-1",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a zero amount", () => {
    expect(() =>
      createSchema.parse({
        amount: "0",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a currencyCode of wrong length", () => {
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "us", // length 2
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a non-ISO-4217 3-character currencyCode (4R C-risk fix)", () => {
    // length(3) alone passed; the regex /^[A-Z]{3}$/ now enforces the
    // ISO 4217 alphabet too. Garbage 3-char strings must be rejected.
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "$€¥",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "1;D",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "usd", // lowercase — ISO 4217 is uppercase
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "USD",
        kind: "transfer",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects notes longer than 500 chars", () => {
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        notes: "x".repeat(501),
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("allows notes to be omitted", () => {
    const result = createSchema.parse({
      amount: "1",
      currencyCode: "USD",
      kind: "income",
      categoryId: "ckl5g8z3a0001abcd1234ef",
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    expect(result.notes).toBeUndefined();
  });
});

// ---- 4R review fixes (CRITICAL from review-reliability) ----

describe("4R-coverage tests", () => {
  it("rejects an amount with 3 decimal places (C1 — multipleOf(0.01) tested)", () => {
    expect(() =>
      createSchema.parse({
        amount: "100.555",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("accepts an amount with exactly 2 decimal places", () => {
    const result = createSchema.parse({
      amount: "100.55",
      currencyCode: "USD",
      kind: "expense",
      categoryId: "ckl5g8z3a0001abcd1234ef",
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    expect(result.amount).toBe("100.55");
  });

  it("rejects a non-cuid categoryId (C2 — .cuid() tested)", () => {
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "not-a-cuid",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects notes with control characters (4R W-risk fix)", () => {
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        notes: "lunch\x07break", // BEL control char
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects unknown keys (4R W-risk fix — .strict())", () => {
    expect(() =>
      createSchema.parse({
        amount: "1",
        currencyCode: "USD",
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
        rogueField: "should-not-pass",
      }),
    ).toThrow();
  });
});
