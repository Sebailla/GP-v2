'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * Empty state for the Reports page — shown when the user has no
 * transactions in the selected range. Includes an onboarding CTA
 * that links to `/[locale]/transactions/new` so a fresh user can
 * create their first transaction.
 *
 * Per spec scenario S2 ("Monthly summary, fresh user"), this state
 * is reachable when transactionCount === 0 in the summary response.
 * Per spec scenario S17 ("Empty state CTA"), the copy must include
 * a "create your first transaction" button.
 */
export function ReportsEmptyState({ locale }: { locale: string }) {
  const t = useTranslations('reports.states');
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/30 p-12 text-center">
      <p className="text-base font-medium">{t('emptyTitle')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t('emptyDescription')}</p>
      <Button asChild variant="default">
        <a href={`/${locale}/transactions/new`}>{t('emptyCta')}</a>
      </Button>
    </div>
  );
}
