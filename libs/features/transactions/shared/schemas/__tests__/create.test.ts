import { describe, it, expect } from "vitest";
import { createSchema } from "../create.js";

describe("createSchema (POST /transactions)", () => {
  it("accepts a well-formed payload and coerces occurredAt to Date", () => {
    const result = createSchema.parse({
      amount: 100.5,
      currencyCode: "USD",
      kind: "expense",
      categoryId: "ckl5g8z3a0001abcd1234ef",
      notes: "lunch",
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    expect(result.amount).toBe(100.5);
    expect(result.kind).toBe("expense");
    expect(result.notes).toBe("lunch");
    expect(result.occurredAt).toBeInstanceOf(Date);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      createSchema.parse({
        amount: -1,
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
        amount: 0,
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
        amount: 1,
        currencyCode: "us", // length 2
        kind: "expense",
        categoryId: "ckl5g8z3a0001abcd1234ef",
        occurredAt: "2026-01-15T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      createSchema.parse({
        amount: 1,
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
        amount: 1,
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
      amount: 1,
      currencyCode: "USD",
      kind: "income",
      categoryId: "ckl5g8z3a0001abcd1234ef",
      occurredAt: "2026-01-15T12:00:00.000Z",
    });
    expect(result.notes).toBeUndefined();
  });
});
