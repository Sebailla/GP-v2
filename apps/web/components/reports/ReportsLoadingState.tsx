'use client';

import { useTranslations } from 'next-intl';

/**
 * Loading state skeleton for the Reports page.
 *
 * Lives at `apps/web/components/reports/ReportsLoadingState.tsx`.
 * Renders a skeleton that mimics the 4-card layout (summary card +
 * category breakdown table + period comparison panel + export button)
 * so the page doesn't shift when the data arrives.
 *
 * Per AGENTS.md §9 (5-state coverage), this is the loading half of
 * the discriminated-union state machine that the parent
 * `ReportsWorkspace` switches on.
 */
export function ReportsLoadingState() {
  const t = useTranslations('reports.states');
  return (
    <div
      className="grid gap-4"
      role="status"
      aria-live="polite"
      aria-label={t('loading')}
    >
      <div className="h-32 animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-md bg-muted" />
      <div className="h-48 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
