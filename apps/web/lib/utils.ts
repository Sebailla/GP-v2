import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Canonical class-name merger for `apps/web`.
 *
 * Composes `clsx` (truthy-filter + conditional + array support) with
 * `tailwind-merge` (resolves conflicting Tailwind utilities so the
 * LAST one wins and `p-4` beats `p-2`). This is the exact pattern
 * shadcn-style primitives use in `button.tsx` / `input.tsx` / `card.tsx`
 * (slice 4 batch 4b), and the helper gets called from every form.
 *
 * Per design §6.5: "the merge step is the load-bearing detail" — the
 * helper exists so that callers can write `cn("px-2", someCondition &&
 * "p-4")` and trust that:
 *   1. Falsey entries are filtered out (clsx).
 *   2. Conflicting Tailwind utilities are resolved with last-write-wins
 *      semantics (tailwind-merge).
 *
 * Examples:
 *   cn("p-2", "p-4")                  → "p-4"
 *   cn("text-red-500", null, "text-blue-500") → "text-blue-500"
 *   cn("px-2", "p-4")                  → "p-4 px-2"
 *
 * Pure function. No I/O. No framework deps beyond `clsx` +
 * `tailwind-merge` (devDeps transitively).
 *
 * @param inputs - Variable-length class-value list. Each entry may be a
 *   string, number, boolean, null, undefined, an array, or an object of
 *   `{ [className: boolean]: boolean }` per `clsx`'s public contract.
 * @returns A single space-separated class string with conflicting
 *   Tailwind utilities resolved (last write wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
