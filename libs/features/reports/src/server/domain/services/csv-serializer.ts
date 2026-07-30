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
 * Apply the CSV injection guard to a single cell.
 *
 * The guard ONLY triggers on a LEADING character in the FORMULA_TRIGGERS
 * set. Mid-string occurrences (e.g., "foo=bar") are NOT guarded because
 * Excel only auto-executes formulas at the start of a cell.
 *
 * For STRING-typed cells, the guard fires whenever the leading char is
 * a formula trigger — Excel/Sheets will auto-execute the formula
 * regardless of whether the value happens to look numeric.
 *
 * For NUMBER-typed cells (passed through coerce()'s number branch),
 * the guard is SKIPPED — those are legitimate numbers, not strings a
 * user typed. The caller is responsible for not putting strings in
 * number-typed columns.
 */
function guardFormula(s: string, wasNumber: boolean): string {
  if (s.length === 0) return s;
  if (wasNumber) return s; // Numbers are never formula vectors.
  const first = s.charAt(0);
  if (!FORMULA_TRIGGERS.has(first)) return s;
  return "'" + s;
}

/**
 * Coerce a cell value to a string for serialization.
 *
 * - null / undefined → ''.
 * - number → String(n). Marks `wasNumber = true` so the formula guard
 *   can be skipped for genuine numbers.
 * - string → as-is. Marks `wasNumber = false` so the formula guard fires
 *   on any string starting with a formula trigger.
 * - boolean → 'true' / 'false'.
 * - anything else → JSON.stringify (defensive).
 */
function coerce(v: unknown): { s: string; wasNumber: boolean } {
  if (v === null || v === undefined) return { s: '', wasNumber: false };
  if (typeof v === 'number') return { s: String(v), wasNumber: true };
  if (typeof v === 'boolean') return { s: v ? 'true' : 'false', wasNumber: false };
  if (typeof v === 'string') return { s: v, wasNumber: false };
  try {
    return { s: JSON.stringify(v), wasNumber: false };
  } catch {
    return { s: '', wasNumber: false };
  }
}

/**
 * Escape a single cell per RFC 4180 + the injection guard.
 *
 * Order of operations (matters!):
 * 1. Coerce to string (tracking whether the original was a number).
 * 2. Apply injection guard (skip if the original was a number).
 * 3. Check if quoting is needed (comma, double quote, CR, LF).
 * 4. If quoting needed: wrap in double quotes and double inner quotes.
 */
function escapeCell(v: unknown): string {
  const { s, wasNumber } = coerce(v);
  const guarded = guardFormula(s, wasNumber);
  if (guarded.length === 0) return guarded;
  let needsQuote = false;
  for (let i = 0; i < guarded.length; i++) {
    if (NEEDS_QUOTING.has(guarded.charAt(i))) {
      needsQuote = true;
      break;
    }
  }
  if (!needsQuote) return guarded;
  return '"' + guarded.replace(/"/g, '""') + '"';
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
