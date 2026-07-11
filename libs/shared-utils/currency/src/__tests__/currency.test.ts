import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { formatCurrency } from "../index";

/**
 * TDD contract for @shared-utils/currency.
 *
 *  - RED:    formatCurrency(Decimal(1234.56), USD) emits a
 *            locale-aware currency string in en-US by default.
 *  - GREEN:  formatCurrency accepts a locale; emits the currency
 *            symbol; rounds to 2 fractional digits.
 *  - TRIANGULATE: negative values, large values, zero, locale
 *            fallbacks (es-AR uses comma separator + AR$ prefix).
 */

describe("formatCurrency", () => {
  it("formats a Decimal value in en-US with a USD prefix", () => {
    const out = formatCurrency(new Decimal("1234.56"), "USD");
    // en-US emits "$1,234.56"
    expect(out).toBe("$1,234.56");
  });

  it("respects an explicit locale", () => {
    const en = formatCurrency(new Decimal("1234.56"), "USD", { locale: "en-US" });
    const ar = formatCurrency(new Decimal("1234.56"), "USD", { locale: "es-AR" });
    expect(en).not.toBe(ar);
    expect(en).toBe("$1,234.56");
    // es-AR uses "US$" prefix + comma decimal separator
    expect(ar).toContain("US$");
  });

  it("emits zero as $0.00", () => {
    expect(formatCurrency(new Decimal("0"), "USD")).toBe("$0.00");
  });

  it("emits a negative value with the standard accounting prefix", () => {
    const out = formatCurrency(new Decimal("-50.25"), "USD");
    expect(out).toBe("-$50.25");
  });

  it("rounds to 2 fractional digits by default", () => {
    const out = formatCurrency(new Decimal("10.999"), "USD");
    expect(out).toBe("$11.00");
  });

  it("formats a large value with thousand separators", () => {
    const out = formatCurrency(new Decimal("1234567890.12"), "USD");
    expect(out).toBe("$1,234,567,890.12");
  });

  it("accepts a numeric or string input via the toDecimal coercion", () => {
    const fromNumber = formatCurrency(1234.56, "USD");
    const fromString = formatCurrency("1234.56", "USD");
    expect(fromNumber).toBe("$1,234.56");
    expect(fromString).toBe("$1,234.56");
  });

  it("formats ARS in es-AR with the local currency symbol", () => {
    const out = formatCurrency(new Decimal("1000"), "ARS", { locale: "es-AR" });
    expect(out).toContain("$");
    expect(out).toContain("1.000");
  });
});
