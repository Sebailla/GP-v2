'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Filter bar for the Reports page.
 *
 * Lives at `apps/web/components/reports/ReportsFilterBar.tsx`. Hosts:
 *   - Four preset buttons (This month / Last month / Last 3 months / YTD).
 *   - Custom range inputs (fromDate / toDate).
 *   - Bucket selector (week / month) — only visible when the by-period
 *     endpoint is enabled (always, in this slice).
 *   - Apply button that calls `onApply(query)` with the new query.
 *
 * State is held by the parent `ReportsWorkspace` (the FilterBar is
 * presentational; the parent owns the query + the apply handler).
 * That keeps the FilterBar testable in isolation and follows the
 * container-vs-presentational pattern.
 */
export interface ReportsFilterBarQuery {
  readonly fromDate: string;
  readonly toDate: string;
  readonly bucket: 'week' | 'month';
  readonly currencyCode?: string;
}

export interface ReportsFilterBarProps {
  readonly query: ReportsFilterBarQuery;
  readonly onApply: (next: ReportsFilterBarQuery) => void;
}

const PRESETS: Array<{
  key: 'thisMonth' | 'lastMonth' | 'last3Months' | 'ytd';
  resolve: () => { fromDate: string; toDate: string };
}> = [
  {
    key: 'thisMonth',
    resolve: () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, '0');
      const lastDay = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).getUTCDate();
      return { fromDate: `${y}-${m}-01`, toDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
    },
  },
  {
    key: 'lastMonth',
    resolve: () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const lastMonth = m === 0 ? 12 : m;
      const lastMonthYear = m === 0 ? y - 1 : y;
      const lastDay = new Date(Date.UTC(lastMonthYear, lastMonth, 0)).getUTCDate();
      return {
        fromDate: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`,
        toDate: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    },
  },
  {
    key: 'last3Months',
    resolve: () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      const startY = m <= 3 ? y - 1 : y;
      const startM = m <= 3 ? m + 9 : m - 3;
      const lastDay = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).getUTCDate();
      return {
        fromDate: `${startY}-${String(startM).padStart(2, '0')}-01`,
        toDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    },
  },
  {
    key: 'ytd',
    resolve: () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const lastDay = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).getUTCDate();
      return { fromDate: `${y}-01-01`, toDate: `${y}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
    },
  },
];

export function ReportsFilterBar({ query, onApply }: ReportsFilterBarProps) {
  const t = useTranslations('reports.filterBar');

  function applyPreset(key: 'thisMonth' | 'lastMonth' | 'last3Months' | 'ytd') {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const resolved = preset.resolve();
    onApply({ ...query, fromDate: resolved.fromDate, toDate: resolved.toDate });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-4">
      <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('thisMonth')}>
        {t('presetThisMonth')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('lastMonth')}>
        {t('presetLastMonth')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('last3Months')}>
        {t('presetLast3Months')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('ytd')}>
        {t('presetYTD')}
      </Button>

      <div className="ml-2 flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="reports-from">
            {t('fromDate')}
          </label>
          <Input
            id="reports-from"
            type="date"
            value={query.fromDate}
            onChange={(e) => onApply({ ...query, fromDate: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="reports-to">
            {t('toDate')}
          </label>
          <Input
            id="reports-to"
            type="date"
            value={query.toDate}
            onChange={(e) => onApply({ ...query, toDate: e.target.value })}
          />
        </div>
      </div>

      <div className="ml-2 flex items-end gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="reports-bucket">
          {t('bucket')}
        </label>
        <select
          id="reports-bucket"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={query.bucket}
          onChange={(e) => onApply({ ...query, bucket: e.target.value as 'week' | 'month' })}
        >
          <option value="week">{t('bucketWeek')}</option>
          <option value="month">{t('bucketMonth')}</option>
        </select>
      </div>
    </div>
  );
}
