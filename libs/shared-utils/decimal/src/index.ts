import Decimal from "decimal.js";

/**
 * Wrappers around decimal.js for monetary math.
 *
 * Why decimal.js (and NOT BigInt, per D-TX-6):
 *  - BigInt is integer-only; money needs fractional cents.
 *  - Primitive `number` drifts on IEEE-754 (0.1 + 0.2 !== 0.3);
 *    decimal.js keeps the audit-friendly exact decimal shape.
 *
 * Public API:
 *  - toDecimal(value) → Decimal
 *  - add(a, b) → Decimal
 *  - subtract(a, b) → Decimal
 *  - compare(a, b) → -1 | 0 | 1
 *
 * All inputs are coerced through `toDecimal` so callers can pass
 * Decimal, string, or primitive number interchangeably.
 */

export type DecimalLikeInput = Decimal | string | number;

export function toDecimal(value: DecimalLikeInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "string") return new Decimal(value);
  if (typeof value === "number") return new Decimal(value);
  throw new TypeError(
    `toDecimal: expected Decimal | string | number, got ${typeof value}`
  );
}

export function add(a: DecimalLikeInput, b: DecimalLikeInput): Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

export function subtract(a: DecimalLikeInput, b: DecimalLikeInput): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

/**
 * Compare two decimal values. Returns -1 when a < b, 0 when equal,
 * 1 when a > b. Coerces inputs so callers don't have to.
 */
export function compare(a: DecimalLikeInput, b: DecimalLikeInput): -1 | 0 | 1 {
  const left = toDecimal(a);
  const right = toDecimal(b);
  const cmp = left.cmp(right);
  if (cmp < 0) return -1;
  if (cmp > 0) return 1;
  return 0;
}

export { Decimal };