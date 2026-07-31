'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { useReportsByCategory, useReportsByPeriod, useReportsCsv, useReportsSummary } from '@features/reports/client';

import { ReportsFilterBar, type ReportsFilterBarQuery } from './ReportsFilterBar';
import { MonthlySummaryCard } from './MonthlySummaryCard';
import { CategoryBreakdownTable, type CategoryBreakdownRow } from './CategoryBreakdownTable';
import { PeriodComparisonPanel, type PeriodComparisonData } from './PeriodComparisonPanel';
import { ExportCsvButton } from './ExportCsvButton';
import { FxStalenessBanner } from './FxStalenessBanner';
import { ReportsLoadingState } from './ReportsLoadingState';
import { ReportsErrorState } from './ReportsErrorState';
import { ReportsEmptyState } from './ReportsEmptyState';

export interface ReportsWorkspaceProps {
  readonly locale: string;
}

export function ReportsWorkspace({ locale }: ReportsWorkspaceProps) {
  const t = useTranslations('reports');
  const [query, setQuery] = useState<ReportsFilterBarQuery>(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return {
      fromDate: `${y}-${m}-01`,
      toDate: `${y}-${m}-15`,
      bucket: 'month',
    };
  });

  const summary = useReportsSummary({
    fromDate: query.fromDate,
    toDate: query.toDate,
    currencyCode: query.currencyCode,
  });
  const breakdown = useReportsByCategory({
    fromDate: query.fromDate,
    toDate: query.toDate,
    currencyCode: query.currencyCode,
  });
  const period = useReportsByPeriod({
    fromDate: query.fromDate,
    toDate: query.toDate,
    bucket: query.bucket,
    currencyCode: query.currencyCode,
  });
  const csv = useReportsCsv();

  const isLoading = summary.status === 'loading' || breakdown.status === 'loading' || period.status === 'loading';
  const firstError =
    summary.status === 'error'
      ? summary.error
      : breakdown.status === 'error'
        ? breakdown.error
        : period.status === 'error'
          ? period.error
          : null;

  if (isLoading && summary.status === 'loading') {
    return <ReportsLoadingState />;
  }
  if (firstError !== null) {
    const reloadAll = () => {
      summary.reload();
      breakdown.reload();
      period.reload();
    };
    return <ReportsErrorState error={firstError} onRetry={reloadAll} />;
  }
  if (
    summary.status === 'success' &&
    breakdown.status === 'success' &&
    period.status === 'success'
  ) {
    const summaryData = summary.data as {
      transactionCount: number;
      income: string;
      expense: string;
      net: string;
      currencyCode: string;
      fxFreshness: 'fresh' | 'stale';
    };
    if (summaryData.transactionCount === 0) {
      return <ReportsEmptyState locale={locale} />;
    }
    const breakdownRows = breakdown.data as readonly CategoryBreakdownRow[];
    const periodData = period.data as PeriodComparisonData;
    return (
      <div className="grid gap-4">
        <ReportsFilterBar query={query} onApply={setQuery} />
        {summaryData.fxFreshness === 'stale' && <FxStalenessBanner />}
        <MonthlySummaryCard
          income={summaryData.income}
          expense={summaryData.expense}
          net={summaryData.net}
          transactionCount={summaryData.transactionCount}
          currencyCode={summaryData.currencyCode}
        />
        <CategoryBreakdownTable rows={breakdownRows} currencyCode={summaryData.currencyCode} />
        <PeriodComparisonPanel data={periodData} currencyCode={summaryData.currencyCode} />
        <ExportCsvButton
          isLoading={csv.isLoading}
          onDownloadSummary={() =>
            csv.downloadCsv({ fromDate: query.fromDate, toDate: query.toDate, detail: 'summary' })
          }
          onDownloadTransactions={() =>
            csv.downloadCsv({ fromDate: query.fromDate, toDate: query.toDate, detail: 'transactions' })
          }
        />
      </div>
    );
  }

  return <ReportsLoadingState />;
}
