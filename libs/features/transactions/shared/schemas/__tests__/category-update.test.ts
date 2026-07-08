import { describe, it, expect } from "vitest";
import { categoryUpdateSchema } from "../category-update.js";

describe("categoryUpdateSchema (PATCH /categories/:id)", () => {
  it("accepts a partial payload (name only)", () => {
    const result = categoryUpdateSchema.parse({ name: "Dining" });
    expect(result.name).toBe("Dining");
    expect(result.kind).toBeUndefined();
  });

  it("accepts an empty object", () => {
    const result = categoryUpdateSchema.parse({});
    expect(result).toEqual({});
  });

  it("does NOT expose `slug` — slugs are immutable here", () => {
    // Type-level: the parsed object must NOT have a `slug` key.
    const result = categoryUpdateSchema.parse({ name: "Dining" });
    expect(Object.keys(result)).not.toContain("slug");
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      categoryUpdateSchema.parse({ kind: "transfer" }),
    ).toThrow();
  });

  // ---- 4R review fixes ----

  it("rejects a name with control characters", () => {
    expect(() => categoryUpdateSchema.parse({ name: "abc\x1b" })).toThrow(); // ESC
  });

  it("rejects unknown keys in category-update (.strict())", () => {
    expect(() =>
      categoryUpdateSchema.parse({ rogueField: "x" }),
    ).toThrow();
  });
});
