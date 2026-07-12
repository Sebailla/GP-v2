/**
 * Vitest contract test for the `parseAmount` helper used by the
 * transactions slice BDD step-defs.
 *
 * Lives at `libs/features/transactions/docs/__tests__/parse-amount.test.ts`.
 *
 * Purpose (Slice 7 / PR-8 commit 3):
 *   Lock in the contract of `parseAmount` from `step-defs/data.steps.ts`.
 *   The function parses fixture amounts captured from `.feature` step
 *   text (e.g. `one income of "+100" and one expense of "-40"`). The
 *   capture includes the surrounding quotes and the `+`/`-` sign; the
 *   downstream production code stores the magnitude (sign lives in the
 *   `kind` field), so parseAmount's job is to normalize to a clean
 *   decimal string.
 *
 * Contract:
 *   - Plain unsigned decimal: returned verbatim
 *       ("100.50"  → "100.50")
 *   - Leading `+` or `-` on a clean decimal: stripped
 *       ("+100"    → "100")
 *       ("-40"     → "40")
 *       ("+1.50"   → "1.50")
 *       ("-0.99"   → "0.99")
 *   - Quotes / surrounding punctuation: stripped via the fallback path
 *       ('"+100"'  → "100")
 *   - Garbage / mixed: digits + dots kept, everything else dropped
 *       ("abc"     → "")
 *       ("1.2.3"   → "1.2.3")   // regex precision check skipped on fallback
 *
 * Implementation note: the function uses a regex fast-path for clean
 * signed decimals and a `.replace(/[^0-9.]/g, "")` fallback for the
 * quoted / dirty cases that pass through from `cucumber.mjs`'s regex
 * capture. Both paths must produce identical magnitudes.
 */

import { describe, it, expect } from "vitest";
import { parseAmount } from "../step-defs/data.steps.js";

describe("parseAmount — transactions slice BDD helper", () => {
  describe("clean unsigned decimals (fast path)", () => {
    it("returns the input unchanged for a plain integer", () => {
      expect(parseAmount("100")).toBe("100");
    });

    it("returns the input unchanged for a decimal with up to 2 fraction digits", () => {
      expect(parseAmount("100.50")).toBe("100.50");
      expect(parseAmount("0.99")).toBe("0.99");
      expect(parseAmount("1")).toBe("1");
    });

    it("returns the input unchanged for zero", () => {
      expect(parseAmount("0")).toBe("0");
      expect(parseAmount("0.00")).toBe("0.00");
    });

    it("accepts the 15-digit precision cap", () => {
      expect(parseAmount("999999999999999")).toBe("999999999999999");
      expect(parseAmount("999999999999999.99")).toBe("999999999999999.99");
    });
  });

  describe("signed decimals (fast path with sign-strip)", () => {
    it("strips a leading +", () => {
      expect(parseAmount("+100")).toBe("100");
      expect(parseAmount("+100.50")).toBe("100.50");
    });

    it("strips a leading -", () => {
      expect(parseAmount("-40")).toBe("40");
      expect(parseAmount("-40.50")).toBe("40.50");
      expect(parseAmount("-0.99")).toBe("0.99");
    });

    it("strips a leading + on zero", () => {
      expect(parseAmount("+0")).toBe("0");
      expect(parseAmount("-0")).toBe("0");
    });
  });

  describe("quoted capture strings (fallback path — signs are still stripped)", () => {
    it("strips double-quotes and a leading +", () => {
      expect(parseAmount('"+100"')).toBe("100");
    });

    it("strips double-quotes and a leading -", () => {
      expect(parseAmount('"-40"')).toBe("40");
    });

    it("strips double-quotes around an unsigned decimal", () => {
      expect(parseAmount('"12.34"')).toBe("12.34");
    });
  });

  describe("garbage / malformed input", () => {
    it("returns an empty string for pure non-digit input", () => {
      expect(parseAmount("abc")).toBe("");
      expect(parseAmount("---")).toBe("");
      expect(parseAmount("")).toBe("");
    });

    it("keeps digits and dots, drops everything else (no decimal-precision enforcement on the fallback path)", () => {
      // The fast-path regex enforces 2-fraction-digit precision; the
      // fallback does not. Documenting the current contract: inputs that
      // fail the fast path keep every digit/dot they contain.
      expect(parseAmount("1.2.3")).toBe("1.2.3");
      expect(parseAmount(" 100 ")).toBe("100");
    });
  });
});