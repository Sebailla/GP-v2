/**
 * Pure-domain CSV serializer.
 *
 * Used by `GET /api/reports/export.csv`. Two safety concerns:
 *
 * 1. CSV injection guard: Excel/Google Sheets auto-execute formulas
 *    when a cell starts with `=`, `+`, `-`, `@`. Cells starting with
 *    any of these are prefixed with a single quote (') to render them
 *    as literal text.
 *
 * 2. Standard CSV escaping: cells containing `,`, `"`, CR, or LF are
 *    wrapped in double quotes; inner `"` are doubled.
 *
 * Output format: UTF-8 with BOM (Excel-friendly), CRLF line endings.
 *
 * This service is pure (no I/O). The controller (PR #3) writes the
 * returned string to the response body with the appropriate headers.
 */

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@']);
const NEEDS_QUOTING = new Set([',', '"', '\r', '\n']);
const BOM = '\uFEFF';
const LINE_ENDING = '\r\n';
const INJECTION_GUARD_PREFIX = "'";

/**
 * Coerce a cell value to a string for serialization.
 *
 * - null / undefined → ''.
 * - number → String(n).
 * - boolean → 'true' / 'false'.
 * - string → as-is.
 * - anything else → JSON.stringify (defensive fallback).
 */
function coerce(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

/**
 * Apply the CSV injection guard to a string.
 *
 * The guard ONLY triggers when:
 * - the string is non-empty, AND
 * - its leading character is in FORMULA_TRIGGERS, AND
 * - the original cell value was NOT a number (numbers like -100 are
 *   legitimate and never formula vectors).
 *
 * Mid-string occurrences (e.g., "foo=bar") are NOT guarded because
 * Excel only auto-executes formulas at the start of a cell.
 */
function guardFormula(s: string, wasNumber: boolean): string {
  if (wasNumber) return s;
  if (s.length === 0) return s;
  if (!FORMULA_TRIGGERS.has(s.charAt(0))) return s;
  return INJECTION_GUARD_PREFIX + s;
}

/**
 * Apply RFC 4180 quoting to a string. Returns the string wrapped in
 * double quotes with embedded `"` doubled, or unchanged if no quoting
 * is needed.
 */
function quoteIfNeeded(s: string): string {
  for (let i = 0; i < s.length; i++) {
    if (NEEDS_QUOTING.has(s.charAt(i))) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
  }
  return s;
}

/**
 * Escape a single cell per RFC 4180 + the injection guard.
 *
 * Order of operations (matters!):
 * 1. Coerce to string.
 * 2. Apply injection guard (skip if the original was a number).
 * 3. RFC 4180 quoting.
 */
function escapeCell(v: unknown): string {
  const wasNumber = typeof v === 'number';
  const s = guardFormula(coerce(v), wasNumber);
  return quoteIfNeeded(s);
}

/**
 * Serialize an array of row records into a CSV string.
 *
 * Output format:
 * - UTF-8 with BOM (first 3 bytes: 0xEF, 0xBB, 0xBF).
 * - CRLF line endings.
 * - Header row derived from `columns`.
 * - One row per record.
 *
 * Columns are emitted in the order specified, not the object key order.
 * Unknown columns in a row are coerced to ''. Missing columns in a
 * row are coerced to ''.
 */
function serialize(
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  columns: readonly string[],
): string {
  const out: string[] = [BOM];

  out.push(columns.map((c) => escapeCell(c)).join(','));
  out.push(LINE_ENDING);

  for (const row of rows) {
    out.push(columns.map((c) => escapeCell(row[c])).join(','));
    out.push(LINE_ENDING);
  }

  return out.join('');
}

export const csvSerializer = {
  serialize,
};

export type CsvSerializer = typeof csvSerializer;
