'use client';

import { useTranslations } from 'next-intl';

/**
 * Banner shown when the server reports an FX rate that's older than
 * 24h. Per spec scenario S13 ("Banner of FX freshness"), this is the
 * user-facing signal that the figures are approximate.
 */
export function FxStalenessBanner() {
  const t = useTranslations('reports.summary');
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {t('fxStale')}
    </div>
  );
}
