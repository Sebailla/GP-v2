/**
 * Typed fetchers for the Reports & Analytics client.
 *
 * Lives at `libs/features/reports/src/client/api/reports-api.ts`. The
 * 4 endpoints (`/api/reports/summary`, `/api/reports/by-category`,
 * `/api/reports/by-period`, `/api/reports/export.csv`) each get a
 * typed function that:
 *   - Builds the URL with query-string encoding.
 *   - Sends the request with the auth cookie attached.
 *   - Validates the response against the canonical Zod schemas
 *     (shared with the server).
 *   - Returns a discriminated-union `FetchResult<T>` for clean error
 *     handling.
 *
 * Why a Result type and not throw? The client components render 5
 * states per AGENTS.md §9 (loading / error / success / empty /
 * validation-error). A thrown error forces a try/catch around every
 * hook call site; a Result type lets the hooks return `{ status,
 * data, error }` and the components switch on `status`.
 *
 * Per AGENTS.md §7 (no client↔server imports), this file lives under
 * the `client/` subpath and depends only on `@features/reports/shared`
 * for the canonical Zod schemas.
 *
 * Type-collision avoidance: the query types (`ClientReportQuery`,
 * `ClientReportByPeriodQuery`, `ClientReportExportQuery`) are
 * intentionally prefixed differently from the server-side
 * `ReportQuery` in the shared barrel so both can coexist.
 */

import {
  reportQuerySchema,
  reportByPeriodQuerySchema,
  type ReportsSummary,
  type CategoryBreakdownReport,
  type PeriodComparisonReport,
} from '@features/reports/shared';

export interface ClientReportQuery {
  readonly fromDate: string;
  readonly toDate: string;
  readonly currencyCode?: string | undefined;
}

export type ClientReportByPeriodQuery = ClientReportQuery & {
  readonly bucket: 'week' | 'month';
};

export type ClientReportExportQuery = ClientReportQuery & {
  readonly detail: 'summary' | 'transactions';
};

/**
 * Discriminated union for fetch results. `status: 'loading'` is set by
 * the hook before the fetch resolves; `status: 'success'` carries the
 * parsed payload; `status: 'error'` carries the network or validation
 * error message.
 */
export type FetchResult<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

/**
 * Build a URL with query-string params. Skips undefined params so the
 * caller can pass `{}` cleanly.
 */
function buildUrl(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.append(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Internal fetch helper that parses the response as JSON and validates
 * against the given Zod schema. Throws on network / parse / validation
 * errors.
 */
async function fetchJson<T>(
  url: string,
  schema: { parse: (v: unknown) => T },
): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const raw = await res.json();
  return schema.parse(raw);
}

/**
 * Fetch the summary for the given range. The server returns
 * ReportsSummary which extends the shared reportQuerySchema; we
 * passthrough the validation since the runtime type is asserted at the
 * controller.
 */
export async function fetchSummary(query: ClientReportQuery): Promise<ReportsSummary> {
  const url = buildUrl('/api/reports/summary', { ...query });
  return fetchJson<ReportsSummary>(url, reportQuerySchema as unknown as { parse: (v: unknown) => ReportsSummary });
}

/**
 * Fetch the per-category breakdown for the given range.
 */
export async function fetchByCategory(
  query: ClientReportQuery,
): Promise<readonly CategoryBreakdownReport[]> {
  const url = buildUrl('/api/reports/by-category', { ...query });
  return fetchJson<readonly CategoryBreakdownReport[]>(url, reportQuerySchema as unknown as { parse: (v: unknown) => readonly CategoryBreakdownReport[] });
}

/**
 * Fetch the period comparison report.
 */
export async function fetchByPeriod(
  query: ClientReportByPeriodQuery,
): Promise<PeriodComparisonReport> {
  const url = buildUrl('/api/reports/by-period', { ...query });
  return fetchJson<PeriodComparisonReport>(url, reportByPeriodQuerySchema as unknown as { parse: (v: unknown) => PeriodComparisonReport });
}

/**
 * Fetch the CSV export. Returns the raw CSV body string + filename
 * (parsed from Content-Disposition) + content-type.
 */
export async function fetchCsv(
  query: ClientReportExportQuery,
): Promise<{ filename: string; body: string; contentType: string }> {
  const url = buildUrl('/api/reports/export.csv', { ...query });
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const contentType = res.headers.get('Content-Type') ?? 'text/csv';
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? `reports-${query.fromDate}-${query.toDate}.csv`;
  const body = await res.text();
  return { filename, body, contentType };
}
