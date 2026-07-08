import { describe, it, expect } from "vitest";
import { updateSchema } from "../update.js";

describe("updateSchema (PATCH /transactions/:id)", () => {
  it("accepts a partial payload (only amount)", () => {
    const result = updateSchema.parse({ amount: 50.25 });
    expect(result.amount).toBe(50.25);
  });

  it("accepts an empty object (no-op update is valid)", () => {
    const result = updateSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects a negative amount even in partial updates", () => {
    expect(() => updateSchema.parse({ amount: -1 })).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      updateSchema.parse({ kind: "transfer" }),
    ).toThrow();
  });
});
