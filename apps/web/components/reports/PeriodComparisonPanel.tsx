'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Period comparison panel. Shows the current period expense / income /
 * net next to the previous period, plus the absolute delta and percent
 * change. Per spec scenario S5, the header reads
 * "Este período: $X (vs $Y anterior, +Z%)".
 *
 * Lives at `apps/web/components/reports/PeriodComparisonPanel.tsx`.
 *
 * Note: Recharts integration (a line chart of net over the buckets) is
 * deferred to a follow-up slice. The current implementation shows the
 * numeric comparison + delta; the chart is a UI enhancement, not a
 * core slice requirement.
 */
export interface PeriodComparisonBucket {
  readonly label: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly income: string;
  readonly expense: string;
  readonly net: string;
}

export interface PeriodComparisonData {
  readonly current: {
    readonly totals: { income: string; expense: string; net: string };
    readonly buckets: readonly PeriodComparisonBucket[];
  };
  readonly previous: {
    readonly totals: { income: string; expense: string; net: string };
    readonly buckets: readonly PeriodComparisonBucket[];
  };
  readonly delta: {
    readonly income: string;
    readonly expense: string;
    readonly net: string;
    readonly netPercent: number | null;
  };
}

export interface PeriodComparisonPanelProps {
  readonly data: PeriodComparisonData;
  readonly currencyCode: string;
}

export function PeriodComparisonPanel({ data, currencyCode }: PeriodComparisonPanelProps) {
  const t = useTranslations('reports.period');
  const deltaPercent =
    data.delta.netPercent === null
      ? '—'
      : `${(data.delta.netPercent * 100).toFixed(1)}%`;
  const deltaTone = data.delta.net.startsWith('-') ? 'text-rose-600' : 'text-emerald-600';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-md border p-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('current')}</span>
            <span className="text-sm">{t('income')}: {currencyCode} {data.current.totals.income}</span>
            <span className="text-sm">{t('expense')}: {currencyCode} {data.current.totals.expense}</span>
            <span className="text-base font-semibold">{t('net')}: {currencyCode} {data.current.totals.net}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border p-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('previous')}</span>
            <span className="text-sm">{t('income')}: {currencyCode} {data.previous.totals.income}</span>
            <span className="text-sm">{t('expense')}: {currencyCode} {data.previous.totals.expense}</span>
            <span className="text-base font-semibold">{t('net')}: {currencyCode} {data.previous.totals.net}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border p-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('delta')}</span>
            <span className="text-sm">{t('income')}: {currencyCode} {data.delta.income}</span>
            <span className="text-sm">{t('expense')}: {currencyCode} {data.delta.expense}</span>
            <span className="text-sm">{t('net')}: {currencyCode} {data.delta.net}</span>
            <span className={`text-base font-semibold ${deltaTone}`}>
              {t('deltaPercent')}: {deltaPercent}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
