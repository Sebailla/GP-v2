'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * Error state for the Reports page.
 *
 * Lives at `apps/web/components/reports/ReportsErrorState.tsx`.
 * Shows the error message + a retry button. The retry button calls
 * the parent-supplied `onRetry` callback to re-fetch all 4 endpoints.
 */
export interface ReportsErrorStateProps {
  readonly error: string;
  readonly onRetry: () => void;
}

export function ReportsErrorState({ error, onRetry }: ReportsErrorStateProps) {
  const t = useTranslations('reports.states');
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-8 text-center"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-sm font-medium text-destructive">
        {t('errorTitle')}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">{error}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}
