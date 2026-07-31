'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * CSV download button. Two buttons: "Summary" and "Transactions",
 * per spec scenario S10 + S11. The actual fetch is delegated to the
 * `useReportsCsv` hook (which triggers a browser download via a
 * transient anchor click + Blob URL).
 *
 * Lives at `apps/web/components/reports/ExportCsvButton.tsx`.
 */
export interface ExportCsvButtonProps {
  readonly onDownloadSummary: () => void | Promise<void>;
  readonly onDownloadTransactions: () => void | Promise<void>;
  readonly isLoading: boolean;
  readonly disabled?: boolean;
}

export function ExportCsvButton({
  onDownloadSummary,
  onDownloadTransactions,
  isLoading,
  disabled = false,
}: ExportCsvButtonProps) {
  const t = useTranslations('reports.export');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDownloadSummary}
        disabled={disabled || isLoading}
      >
        {t('summaryLabel')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDownloadTransactions}
        disabled={disabled || isLoading}
      >
        {t('transactionsLabel')}
      </Button>
      {isLoading && (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t('downloading')}
        </span>
      )}
    </div>
  );
}
