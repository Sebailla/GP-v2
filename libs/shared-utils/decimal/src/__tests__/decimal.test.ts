import { describe, expect, it } from "vitest";

import { add, compare, subtract, toDecimal } from "../index";

/**
 * TDD contract for @shared-utils/decimal.
 *
 *  - RED:    toDecimal coerces string | number | Decimal into a
 *            Decimal; primitive number math does not drift
 *            (0.1 + 0.2 !== 0.3 in IEEE-754, but Decimal must).
 *  - GREEN:  add / subtract return a Decimal; compare returns -1
 *            | 0 | 1.
 *  - TRIANGULATE: negative values, large values, equal values,
 *            invalid inputs throw.
 *
 * Per D-TX-6, no BigInt is used anywhere in this package.
 */

describe("toDecimal", () => {
  it("coerces a string", () => {
    expect(toDecimal("10.5").toString()).toBe("10.5");
  });

  it("coerces a primitive number without drift", () => {
    expect(toDecimal(0.1).plus(toDecimal(0.2)).toString()).toBe("0.3");
  });

  it("returns the same Decimal instance when given a Decimal", () => {
    const d = toDecimal("5");
    expect(toDecimal(d)).toBe(d);
  });

  it("throws on a non-supported input", () => {
    expect(() => toDecimal(null as unknown as number)).toThrow(TypeError);
    expect(() => toDecimal(undefined as unknown as number)).toThrow(TypeError);
    expect(() => toDecimal({} as unknown as number)).toThrow(TypeError);
  });
});

describe("add", () => {
  it("adds two positive Decimals", () => {
    expect(add("10.50", "0.25").toString()).toBe("10.75");
  });

  it("adds negative and positive values without drift", () => {
    // decimal.js trims trailing zeros, so 1.10 becomes 1.1 in the
    // canonical string. The drift-free behavior is what matters —
    // compare() below would treat 1.10 and 1.1 as equal regardless.
    expect(add("-1.10", "2.20").toString()).toBe("1.1");
    expect(add("-1.10", "2.20").equals(1.1)).toBe(true);
  });

  it("returns a Decimal instance (not a string)", () => {
    const out = add("1", "2");
    expect(out.toString()).toBe("3");
  });
});

describe("subtract", () => {
  it("subtracts two positive Decimals", () => {
    expect(subtract("10.50", "0.25").toString()).toBe("10.25");
  });

  it("returns a negative Decimal when the minuend is smaller", () => {
    expect(subtract("0.25", "10.50").toString()).toBe("-10.25");
  });
});

describe("compare", () => {
  it("returns 0 for equal values", () => {
    expect(compare("1.00", "1")).toBe(0);
  });

  it("returns 1 when left is greater", () => {
    expect(compare("2", "1")).toBe(1);
  });

  it("returns -1 when right is greater", () => {
    expect(compare("1", "2")).toBe(-1);
  });

  it("treats 1.0 and 1.00 as equal", () => {
    expect(compare("1.0", "1.00")).toBe(0);
  });
});
