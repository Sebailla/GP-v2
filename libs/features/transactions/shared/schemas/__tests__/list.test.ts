import { describe, it, expect } from "vitest";
import { listSchema } from "../list.js";

describe("listSchema (GET /transactions)", () => {
  it("accepts an empty query and applies default pageSize = 20", () => {
    const result = listSchema.parse({});
    expect(result.pageSize).toBe(20);
    expect(result.cursor).toBeUndefined();
  });

  it("coerces pageSize from string", () => {
    const result = listSchema.parse({ pageSize: "50" });
    expect(result.pageSize).toBe(50);
  });

  it("rejects pageSize > 100", () => {
    expect(() => listSchema.parse({ pageSize: 101 })).toThrow();
  });

  it("rejects pageSize < 1", () => {
    expect(() => listSchema.parse({ pageSize: 0 })).toThrow();
  });

  it("accepts the full filter set", () => {
    const result = listSchema.parse({
      cursor: "abc123",
      pageSize: 50,
      categoryId: "ckl5g8z3a0001abcd1234ef",
      fromDate: "2026-01-01T00:00:00.000Z",
      toDate: "2026-02-01T00:00:00.000Z",
      currencyCode: "USD",
    });
    expect(result.cursor).toBe("abc123");
    expect(result.pageSize).toBe(50);
    expect(result.currencyCode).toBe("USD");
  });

  it("rejects a currencyCode of wrong length", () => {
    expect(() => listSchema.parse({ currencyCode: "us" })).toThrow();
  });

  // ---- 4R review fixes ----

  it("rejects a non-ISO-4217 3-character currencyCode in list query", () => {
    expect(() => listSchema.parse({ currencyCode: "$€¥" })).toThrow();
    expect(() => listSchema.parse({ currencyCode: "usd" })).toThrow();
  });

  it("rejects a cursor longer than 128 characters (S-risk S2)", () => {
    expect(() => listSchema.parse({ cursor: "x".repeat(129) })).toThrow();
  });

  it("accepts a cursor up to 128 characters", () => {
    const result = listSchema.parse({ cursor: "x".repeat(128) });
    expect(result.cursor).toHaveLength(128);
  });

  it("accepts an inverted date range (no .refine — pinned current behavior)", () => {
    // Pins the current spec-silent behavior: fromDate > toDate is
    // accepted, returns a zero-result query. Pin documented per the 4R
    // review (S-resilience S3) so a future tightening is a deliberate
    // spec change, not silent drift.
    const result = listSchema.parse({
      fromDate: "2026-12-01T00:00:00.000Z",
      toDate: "2026-01-01T00:00:00.000Z",
    });
    expect(result.fromDate).toBeInstanceOf(Date);
    expect(result.toDate).toBeInstanceOf(Date);
  });

  it("rejects unknown keys in list query (.strict())", () => {
    expect(() => listSchema.parse({ rogueField: "x" })).toThrow();
  });
});
