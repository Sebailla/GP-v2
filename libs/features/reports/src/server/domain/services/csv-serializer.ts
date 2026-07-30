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

/**
 * Coerce a cell value to a string for serialization.
 *
 * - null / undefined → ''.
 * - number → String(n).
 * - string → as-is.
 * - boolean → 'true' / 'false'.
 * - anything else → JSON.stringify (defensive).
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
 * Apply the CSV injection guard to a single cell.
 *
 * The guard ONLY triggers on a LEADING character in the FORMULA_TRIGGERS
 * set. Mid-string occurrences (e.g., "foo=bar") are NOT guarded because
 * Excel only auto-executes formulas at the start of a cell.
 *
 * Numeric-looking strings (e.g., "-100.5") are also NOT guarded when
 * they pass the `isNumeric` check — those are legitimate negative
 * numbers, not formulas.
 */
function guardFormula(s: string): string {
  if (s.length === 0) return s;
  const first = s.charAt(0);
  if (!FORMULA_TRIGGERS.has(first)) return s;
  // If the entire string is numeric (e.g., "-100.5", "+1.5e10"), it's
  // a number, not a formula. Pass through.
  if (isNumeric(s)) return s;
  return "'" + s;
}

/**
 * Loose numeric check: matches integers, decimals, negatives, scientific
 * notation. Used to distinguish formula-prefixed cells from negative
 * numbers that happen to start with '-'.
 */
function isNumeric(s: string): boolean {
  if (s.length === 0) return false;
  // Allow optional leading +/-, then digits, optional decimal, optional
  // exponent. Reject anything else (including trailing letters or
  // operators that would make it a formula).
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s);
}

/**
 * Escape a single cell per RFC 4180 + the injection guard.
 *
 * Order of operations (matters!):
 * 1. Coerce to string.
 * 2. Apply injection guard (single-quote prefix).
 * 3. Check if quoting is needed (comma, double quote, CR, LF).
 * 4. If quoting needed: wrap in double quotes and double inner quotes.
 */
function escapeCell(v: unknown): string {
  let s = coerce(v);
  s = guardFormula(s);
  if (s.length === 0) return s;
  let needsQuote = false;
  for (let i = 0; i < s.length; i++) {
    if (NEEDS_QUOTING.has(s.charAt(i))) {
      needsQuote = true;
      break;
    }
  }
  if (!needsQuote) return s;
  return '"' + s.replace(/"/g, '""') + '"';
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

  // Header.
  out.push(columns.map((c) => escapeCell(c)).join(','));
  out.push(LINE_ENDING);

  // Rows.
  for (const row of rows) {
    const cells = columns.map((c) => escapeCell(row[c]));
    out.push(cells.join(','));
    out.push(LINE_ENDING);
  }

  return out.join('');
}

export const csvSerializer = {
  serialize,
};

export type CsvSerializer = typeof csvSerializer;
