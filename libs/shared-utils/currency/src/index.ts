import Decimal from "decimal.js";

/**
 * Localized currency formatting helpers.
 *
 * Why decimal.js:
 *  - D-TX-6 forbids primitive `number` math on money; decimal.js
 *    keeps the wire/audit shape (a string-encoded Decimal) precise
 *    while Intl.NumberFormat handles the locale-aware rendering.
 *
 * Public API:
 *  - formatCurrency(value, currency, { locale }) → string
 *    `value` is coerced through `toDecimal` so callers can pass a
 *    Decimal, a string, or a primitive number without surprise.
 */

export type CurrencyLikeInput = Decimal | string | number;

export interface FormatCurrencyOptions {
  locale?: string;
}

const DEFAULT_LOCALE = "en-US";

/**
 * Coerce any supported input into a Decimal. Strings are parsed via
 * decimal.js's exact decimal parser (no IEEE-754 drift).
 */
export function toDecimal(value: CurrencyLikeInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "string") return new Decimal(value);
  if (typeof value === "number") return new Decimal(value);
  throw new TypeError(`toDecimal: expected Decimal | string | number, got ${typeof value}`);
}

/**
 * Format a monetary value as a localized currency string.
 * Always emits 2 fractional digits (cents / centavos) per ISO 4217.
 */
export function formatCurrency(
  value: CurrencyLikeInput,
  currency: string,
  options: FormatCurrencyOptions = {},
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const decimal = toDecimal(value);
  const fixed = decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fixed.toNumber());
}
