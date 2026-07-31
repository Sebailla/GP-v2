'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Category breakdown table. Renders one row per category with the
 * absolute total + share of total expense. Rows are pre-sorted by the
 * server (absolute expense DESC per spec scenario S4).
 *
 * Lives at `apps/web/components/reports/CategoryBreakdownTable.tsx`.
 */
export interface CategoryBreakdownRow {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly total: string;
  readonly transactionCount: number;
  readonly share: number;
}

export interface CategoryBreakdownTableProps {
  readonly rows: readonly CategoryBreakdownRow[];
  readonly currencyCode: string;
}

export function CategoryBreakdownTable({ rows, currencyCode }: CategoryBreakdownTableProps) {
  const t = useTranslations('reports.breakdown');
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">—</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('category')}</TableHead>
              <TableHead className="text-right">{t('total')}</TableHead>
              <TableHead className="text-right">{t('share')}</TableHead>
              <TableHead className="text-right">{t('transactionCount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.categoryId}>
                <TableCell>{row.categoryName}</TableCell>
                <TableCell className="text-right tabular-nums">{currencyCode} {row.total}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(row.share * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.transactionCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
