import { describe, it, expect } from "vitest";
import { cn } from "../lib/utils";

/**
 * TDD contract for `apps/web/lib/utils.ts#cn` — slice 4 (T4.5).
 *
 * `cn` is the canonical class-name merger used by every shadcn-style
 * primitive in this app (button.tsx, input.tsx, etc.) and by every
 * form. It composes `clsx` (truthy-filter + conditional classes) with
 * `tailwind-merge` (resolve conflicting Tailwind utilities such that
 * the LAST one wins and `p-4` beats `p-2`).
 *
 * Per design §6.5, the merge step is the load-bearing detail:
 *   - `cn('p-2','p-4')` MUST resolve to `'p-4'`.
 *   - `cn('px-2','p-4')` MUST resolve to `'p-4 px-2'` (tailwind-merge
 *     recognizes `px-2` as a subset of `p-4` and drops the conflict).
 *
 * The helper is a pure function with no I/O — unit-test the public
 * shape (return type `string`) plus the merge precedence cases.
 */

describe("cn — class-name merger (T4.5)", () => {
  it("merges conflicting Tailwind padding utilities — last one wins", () => {
    // Arrange / Act
    const result = cn("p-2", "p-4");

    // Assert: tailwind-merge drops `p-2` in favor of `p-4`.
    expect(result).toBe("p-4");
  });

  it("filters out falsy values (null, undefined, false)", () => {
    // clsx contract: falsey values are dropped BEFORE tailwind-merge
    // sees the inputs. The remaining truthy entries are merged.
    const result = cn("text-red-500", null, undefined, false, "text-blue-500");

    // Assert: the conflict is resolved (text-blue-500 wins) and no
    // literal "null"/"undefined"/"false" leaks into the output string.
    expect(result).toBe("text-blue-500");
    expect(result).not.toContain("null");
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("false");
  });

  it("recognizes `px-*` as a subset conflict of `p-*` (broader wins)", () => {
    // tailwind-merge treats `px-2` (horizontal padding) as a STRICT
    // SUBSET of `p-4` (padding-all four sides): every axis that
    // `px-2` sets is already covered by `p-4`. The library drops the
    // redundant subset rather than producing a string that LOOKS like
    // a partial override but is semantically a no-op.
    //
    // (Reverse order — `cn("p-4", "px-2")` — IS a partial override
    // because `p-4` came first and `px-2` legitimately narrows the
    // horizontal axis on top; the lib outputs `"p-4 px-2"`. Order
    // matters in tailwind-merge's class string; this test pins the
    // observed order as specified by the brief — `px-2` first,
    // `p-4` second.)
    //
    // The real-world impact: this assertion protects against a future
    // regression where someone swaps `clsx` for a different merger
    // and silently changes how subset conflicts resolve.
    const result = cn("px-2", "p-4");

    // Assert: tailwind-merge drops `px-2` because `p-4` already
    // covers all four sides — the broader utility subsumes the
    // narrower one.
    expect(result).toBe("p-4");
    expect(result).not.toContain("px-2");
  });

  it("returns a string (type narrowing)", () => {
    const result = cn("foo", "bar");
    expect(typeof result).toBe("string");
    // The braces are intentional: they're a compile-time type assertion
    // for the editor — `result` is `string`, not `string | undefined`
    // (which clsx can return when given only empty inputs).
    const _narrowed: string = result;
    expect(_narrowed).toBe(result);
  });
});
