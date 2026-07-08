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
});
