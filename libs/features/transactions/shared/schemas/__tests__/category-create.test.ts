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

  // ---- 4R review fixes ----

  it("rejects a name with control characters", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "Grocer\x07ies",
        slug: "groceries",
        kind: "expense",
      }),
    ).toThrow();
  });

  it("rejects a name of 81 characters (W2 — max(80) tested)", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "x".repeat(81),
        slug: "ok",
        kind: "expense",
      }),
    ).toThrow();
  });

  it("accepts a name of exactly 80 characters", () => {
    const result = categoryCreateSchema.parse({
      name: "x".repeat(80),
      slug: "ok",
      kind: "expense",
    });
    expect(result.name).toHaveLength(80);
  });

  it("rejects a slug of 81 characters (W3 — slug max(80) tested)", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "ok",
        slug: "a".repeat(81),
        kind: "expense",
      }),
    ).toThrow();
  });

  it("rejects an empty slug (W4 — min(1) belt-and-suspenders)", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "ok",
        slug: "",
        kind: "expense",
      }),
    ).toThrow();
  });

  it("rejects unknown keys in category-create (.strict())", () => {
    expect(() =>
      categoryCreateSchema.parse({
        name: "x",
        slug: "x",
        kind: "expense",
        rogueField: "should-not-pass",
      }),
    ).toThrow();
  });
});
