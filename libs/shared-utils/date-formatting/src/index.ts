/**
 * Timezone-safe date formatting and ISO 8601 parsing helpers.
 *
 * Why Intl.DateTimeFormat:
 *  - Uses ICU data shipped with Node 22 — no date-fns/luxon
 *    dependency for the reference scaffold.
 *  - Locale + time zone are explicit parameters; the default
 *    `en-US / UTC` is the canonical render in dev/CI so tests
 *    are deterministic.
 *
 * Public API:
 *  - formatDate(date, { locale, timeZone }) → string
 *  - parseIsoDate(iso) → Date
 *  - toIsoString(date) → string (UTC, millisecond precision)
 */

export interface FormatDateOptions {
  locale?: string;
  timeZone?: string;
}

const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIME_ZONE = "UTC";

/**
 * Render a Date as a locale- and timezone-aware string. The output
 * shape follows the locale's long-date convention (year, month, day)
 * which is what UI screens and audit logs need most often.
 */
export function formatDate(date: Date, options: FormatDateOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone,
  }).format(date);
}

/**
 * Parse an ISO 8601 string into a Date. Throws on malformed input
 * so callers never silently get an `Invalid Date` instance.
 */
export function parseIsoDate(iso: string): Date {
  if (typeof iso !== "string" || iso.length === 0) {
    throw new TypeError(`parseIsoDate: expected non-empty ISO 8601 string, got ${JSON.stringify(iso)}`);
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`parseIsoDate: invalid ISO 8601 input: ${JSON.stringify(iso)}`);
  }
  return date;
}

/**
 * Emit the canonical UTC ISO 8601 string for a Date. Used by API
 * responses, audit logs, and event payloads so the wire shape is
 * stable regardless of where the Date was constructed.
 */
export function toIsoString(date: Date): string {
  return date.toISOString();
}