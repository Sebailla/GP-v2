import { describe, it, expect } from "vitest";
import { categoryCreateSchema } from "../category-create.js";

describe("categoryCreateSchema (POST /categories)", () => {
  it("accepts a well-formed payload", () => {
    const result = categoryCreateSchema.parse({
      name: "Groceries",
      slug: "groceries",
      kind: "expense",
    });
    expect(result.slug).toBe("groceries");
    expect(result.kind).toBe("expense");
  });

  it("accepts kebab-case slugs", () => {
    const result = categoryCreateSchema.parse({
      name: "Eating out",
      slug: "eating-out",
      kind: "expense",
    });
    expect(result.slug).toBe("eating-out");
  });

  it("rejects an empty name", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "",
        slug: "groceries",
        kind: "expense",
      }),
    ).toThrow();
  });

  it("rejects a slug with uppercase letters", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "Groceries",
        slug: "Groceries",
        kind: "expense",
      }),
    ).toThrow();
  });

  it("rejects a slug with spaces", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "Eating out",
        slug: "eating out",
        kind: "expense",
      }),
    ).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "Salary",
        slug: "salary",
        kind: "transfer",
      }),
    ).toThrow();
  });
});
