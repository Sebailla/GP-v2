/// <reference lib="dom" />
import { useCallback, useEffect, useState } from 'react';

import {
  fetchByCategory,
  fetchByPeriod,
  fetchCsv,
  fetchSummary,
  type FetchResult,
  type ClientReportByPeriodQuery,
  type ClientReportExportQuery,
  type ClientReportQuery,
} from '../api/reports-api.js';

/**
 * Shared hook shape. Each hook returns a 3-state FetchResult + a
 * `reload()` function that re-triggers the fetch.
 *
 * Why not SWR / React Query? The slice follows the project's
 * `React.useCallback` + `useEffect` pattern (see apps/web/components/
 * transactions/TransactionsList.tsx). Adding a state-management lib
 * just for this slice would inflate bundle weight without
 * commensurate benefit. The 4 endpoints fire together once on mount
 * (via the parent ReportsWorkspace), so the lack of cache layer
 * doesn't matter.
 */
type UseQueryResult<T> = FetchResult<T> & { reload: () => void };

/**
 * Internal helper — runs the fetch + sets state + handles unmount
 * race conditions via an AbortController.
 */
function useAsyncQuery<T, Q>(
  query: Q,
  fetcher: (q: Q) => Promise<T>,
): UseQueryResult<T> {
  const [result, setResult] = useState<FetchResult<T>>({ status: 'loading' });
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setResult({ status: 'loading' });

    fetcher(query)
      .then((data: T) => {
        if (!cancelled) setResult({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // reloadCounter triggers re-fetch when reload() is called.
  }, [JSON.stringify(query), reloadCounter]);

  const reload = useCallback(() => {
    setReloadCounter((c: number) => c + 1);
  }, []);

  return { ...result, reload };
}

/**
 * Hook: GET /api/reports/summary.
 */
export function useReportsSummary(query: ClientReportQuery): UseQueryResult<unknown> {
  return useAsyncQuery(query, fetchSummary);
}

/**
 * Hook: GET /api/reports/by-category.
 */
export function useReportsByCategory(query: ClientReportQuery): UseQueryResult<readonly unknown[]> {
  return useAsyncQuery(query, fetchByCategory);
}

/**
 * Hook: GET /api/reports/by-period.
 */
export function useReportsByPeriod(query: ClientReportByPeriodQuery): UseQueryResult<unknown> {
  return useAsyncQuery(query, fetchByPeriod);
}

/**
 * Hook: GET /api/reports/export.csv. Note: this hook does NOT
 * auto-fetch on mount (CSV downloads are user-initiated). Instead it
 * exposes `downloadCsv(detail)` which the ExportCsvButton calls.
 */
export interface UseReportsCsvResult {
  filename: string | null;
  body: string | null;
  contentType: string | null;
  error: string | null;
  isLoading: boolean;
  downloadCsv: (query: ClientReportExportQuery) => Promise<void>;
}

export function useReportsCsv(): UseReportsCsvResult {
  const [filename, setFilename] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const downloadCsv = useCallback(async (query: ClientReportExportQuery) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchCsv(query);
      setFilename(result.filename);
      setBody(result.body);
      setContentType(result.contentType);
      // Trigger the browser download via a transient anchor click.
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([result.body], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { filename, body, contentType, error, isLoading, downloadCsv };
}
