'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Monthly summary card. Renders income / expense / net / transaction
 * count in a 4-column grid. The "fxFreshness" indicator is shown as
 * a separate `FxStalenessBanner` (per spec S13) when applicable.
 *
 * Lives at `apps/web/components/reports/MonthlySummaryCard.tsx`.
 */
export interface MonthlySummaryCardProps {
  readonly income: string;
  readonly expense: string;
  readonly net: string;
  readonly transactionCount: number;
  readonly currencyCode: string;
}

export function MonthlySummaryCard({
  income,
  expense,
  net,
  transactionCount,
  currencyCode,
}: MonthlySummaryCardProps) {
  const t = useTranslations('reports.summary');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label={t('income')} value={formatMoney(income, currencyCode)} tone="positive" />
          <Stat label={t('expense')} value={formatMoney(expense, currencyCode)} tone="negative" />
          <Stat label={t('net')} value={formatMoney(net, currencyCode)} tone="neutral" />
          <Stat label={t('transactionCount')} value={transactionCount.toString()} tone="neutral" />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

/**
 * Format a Decimal-string amount for display. Uses the currency code
 * as a prefix (e.g., "USD 150.00" or "USD -125.00") until the slice
 * adds Intl.NumberFormat currency formatting in a follow-up.
 */
function formatMoney(amount: string, currencyCode: string): string {
  const n = Number(amount);
  const rounded = Number.isFinite(n) ? n.toFixed(2) : amount;
  return `${currencyCode} ${rounded}`;
}
