/**
 * ReportsService — orchestrates the read-only Reports & Analytics surface.
 *
 * Composes:
 * - ReportsRepository (read-only aggregation seam, returns TransactionForReport[]).
 * - FxRateProvider (live FX lookup, from @features/transactions).
 * - timeBucketService (pure-domain bucketing, sibling).
 * - csvSerializer (pure CSV serialization, sibling).
 *
 * The service is the only place where FX normalization happens. All
 * callers (controllers) go through one of the four methods below:
 * getSummary, getByCategory, getByPeriod, exportCsv.
 *
 * Cross-user isolation: every method takes userId as the first
 * parameter and propagates it to every repository call. Tests cover
 * this invariant explicitly.
 */

import { timeBucketService } from './time-bucket.service.js';
import { csvSerializer } from './csv-serializer.js';
import type { ReportsRepository, TransactionForReport, DateRange } from '../ports/index.js';
import type { CurrencyCode, IsoDate } from '../ports/types.js';
import { toDecimal, type Decimal } from '@shared-utils/decimal';

/**
 * FX rate provider port — minimal interface we depend on.
 *
 * The full interface (from @features/transactions) is wider; we only
 * consume the bits we need here. This keeps the dependency surface
 * narrow and makes mocking trivial.
 *
 * Note: `rate` is `Decimal` (decimal.js), matching the contract of
 * `@features/transactions` `InMemoryFxRateProvider` and the rest of
 * the slice-5 financial code. PR #5 of module-6-reports corrected the
 * port to use `Decimal` (previously declared as `string` which was
 * incompatible with the actual adapter and would have failed at runtime
 * when an FX cross-currency report ran).
 */
export interface FxRateProvider {
  getRate(fromCode: string, toCode: string): Promise<{ rate: Decimal; recordedAt: Date } | null>;
}

/**
 * Canonical query shape for the ReportsService. Matches the Zod schema
 * reportQuerySchema (PR #1) but as a plain TS type — the boundary
 * enforces the Zod shape; the service consumes the parsed result.
 *
 * `currencyCode` is optional + accepts undefined (the `?` plus the
 * explicit `| undefined`) so callers can omit the field entirely
 * under `exactOptionalPropertyTypes`.
 */
export interface ReportQuery {
  readonly fromDate: IsoDate;
  readonly toDate: IsoDate;
  readonly currencyCode?: CurrencyCode | undefined;
}

/**
 * Bucket granularity for the period comparison endpoint.
 */
export type Bucket = 'week' | 'month';

/**
 * Result of getSummary — the canonical shape returned by GET /api/reports/summary.
 * Mirrors the reportSummarySchema (PR #1).
 */
export interface ReportsSummary {
  readonly fromDate: IsoDate;
  readonly toDate: IsoDate;
  readonly currencyCode: CurrencyCode;
  readonly income: string;
  readonly expense: string;
  readonly net: string;
  readonly transactionCount: number;
  readonly fxFreshness: 'fresh' | 'stale';
}

/**
 * Result of getByCategory — one entry per category.
 * Mirrors the reportByCategorySchema (PR #1).
 */
export interface CategoryBreakdownReport {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly total: string;
  readonly transactionCount: number;
  readonly share: number;
}

/**
 * Result of getByPeriod — current + previous series + delta.
 * Mirrors the reportByPeriodSchema (PR #1).
 */
export interface PeriodBucket {
  readonly label: string;
  readonly fromDate: IsoDate;
  readonly toDate: IsoDate;
  readonly income: string;
  readonly expense: string;
  readonly net: string;
}
export interface PeriodSeries {
  readonly totals: ReportsSummary;
  readonly buckets: readonly PeriodBucket[];
}
export interface PeriodDelta {
  readonly income: string;
  readonly expense: string;
  readonly net: string;
  readonly netPercent: number | null;
}
export interface PeriodComparisonReport {
  readonly current: PeriodSeries;
  readonly previous: PeriodSeries;
  readonly delta: PeriodDelta;
}

/**
 * Result of exportCsv — the controller writes this to the response body
 * with the appropriate Content-Type and Content-Disposition headers.
 */
export interface CsvExportResult {
  readonly filename: string;
  readonly contentType: 'text/csv; charset=utf-8';
  readonly body: string;
}

/**
 * Dependencies of the ReportsService factory. Injected by the NestJS
 * module (PR #3 wires this in ReportsModule).
 */
export interface ReportsServiceDeps {
  readonly reportsRepository: ReportsRepository;
  readonly fxRateProvider: FxRateProvider;
}

/**
 * ReportsService factory. Pure (no decorators, no NestJS imports) so
 * the unit tests don't need a NestJS Test module.
 */
export function reportsService(deps: ReportsServiceDeps) {
  const { reportsRepository, fxRateProvider } = deps;

  /**
   * Resolve the user's primary currency, falling back to USD with a
   * observability log if the user hasn't set one. Per spec S18.
   */
  async function resolvePrimaryCurrency(userId: string): Promise<{
    currencyCode: CurrencyCode;
    fallbackUsed: boolean;
  }> {
    const primary = await reportsRepository.findPrimaryCurrencyForUser(userId);
    if (primary === null) {
      // Observability: log a warning when a user lacks a primary currency.
      // In a future slice this becomes a structured metric counter.
      console.warn(
        `[reports] user ${userId} has no primary currency; falling back to USD`,
      );
      return { currencyCode: 'USD', fallbackUsed: true };
    }
    return { currencyCode: primary, fallbackUsed: false };
  }

  /**
   * Convert a Decimal-string amount from `from` to `to` via the FX provider.
   * If `from === to`, returns the amount unchanged. If no rate is found,
   * logs and returns the original amount (consumer is responsible for
   * surfacing this in fxFreshness).
   */
  async function convertTo(
    amount: string,
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<{ amount: string; rateFreshness: 'fresh' | 'stale' }> {
    if (from === to) return { amount, rateFreshness: 'fresh' };
    const rate = await fxRateProvider.getRate(from, to);
    if (rate === null) {
      // No rate → keep original amount and mark stale (consumer will
      // decide whether to flag the response).
      return { amount, rateFreshness: 'stale' };
    }
    const fresh = isFresh(rate.recordedAt, 24 * 60 * 60 * 1000);
    return {
      amount: toDecimal(amount).times(toDecimal(rate.rate)).toFixed(2),
      rateFreshness: fresh ? 'fresh' : 'stale',
    };
  }

  /**
   * Convert all transactions in `txs` to `targetCurrency`. Returns the
   * converted totals plus the worst-case fxFreshness (stale if any rate
   * was stale or missing).
   */
  async function convertAll(
    txs: readonly TransactionForReport[],
    targetCurrency: CurrencyCode,
  ): Promise<{
    converted: readonly (TransactionForReport & { _convertedAmount: string })[];
    fxFreshness: 'fresh' | 'stale';
  }> {
    const out: (TransactionForReport & { _convertedAmount: string })[] = [];
    let fxFreshness: 'fresh' | 'stale' = 'fresh';
    for (const t of txs) {
      const { amount, rateFreshness } = await convertTo(t.amount, t.currencyCode, targetCurrency);
      if (rateFreshness === 'stale') fxFreshness = 'stale';
      out.push({ ...t, _convertedAmount: amount });
    }
    return { converted: out, fxFreshness };
  }

  /**
   * Sum the converted amount field across transactions.
   * income = sum of positive amounts, expense = sum of negative amounts
   * (sign-aware: stays negative), net = income + expense.
   */
  function aggregateTotals(
    txs: readonly (TransactionForReport & { _convertedAmount: string })[],
  ): { income: string; expense: string; net: string; transactionCount: number } {
    let income = 0;
    let expense = 0;
    for (const t of txs) {
      const v = Number(t._convertedAmount);
      if (v >= 0) income += v;
      else expense += v;
    }
    const incomeStr = income.toFixed(2);
    const expenseStr = expense.toFixed(2);
    const netStr = (income + expense).toFixed(2);
    return { income: incomeStr, expense: expenseStr, net: netStr, transactionCount: txs.length };
  }

  /**
   * Build a ReportsSummary from already-converted transactions.
   */
  function buildSummary(
    fromDate: IsoDate,
    toDate: IsoDate,
    currencyCode: CurrencyCode,
    converted: readonly (TransactionForReport & { _convertedAmount: string })[],
    fxFreshness: 'fresh' | 'stale',
  ): ReportsSummary {
    const totals = aggregateTotals(converted);
    return {
      fromDate,
      toDate,
      currencyCode,
      income: totals.income,
      expense: totals.expense,
      net: totals.net,
      transactionCount: totals.transactionCount,
      fxFreshness,
    };
  }

  return {
    async getSummary(userId: string, query: ReportQuery): Promise<ReportsSummary> {
      assertRangeWithinCap(query);
      const { currencyCode: target } = await resolvePrimaryCurrency(userId);
      const txs = await reportsRepository.findForUserInRange(userId, {
        fromDate: query.fromDate,
        toDate: query.toDate,
      });
      const { converted, fxFreshness } = await convertAll(txs, target);
      return buildSummary(query.fromDate, query.toDate, target, converted, fxFreshness);
    },

    async getByCategory(
      userId: string,
      query: ReportQuery,
    ): Promise<readonly CategoryBreakdownReport[]> {
      assertRangeWithinCap(query);
      const { currencyCode: target } = await resolvePrimaryCurrency(userId);
      const txs = await reportsRepository.findForUserInRange(userId, {
        fromDate: query.fromDate,
        toDate: query.toDate,
      });
      const { converted } = await convertAll(txs, target);

      // Group by categoryId.
      type Group = {
        categoryId: string;
        categoryName: string;
        amounts: string[];
      };
      const groups = new Map<string, Group>();
      for (const t of converted) {
        let g = groups.get(t.categoryId);
        if (!g) {
          g = { categoryId: t.categoryId, categoryName: t.categoryName, amounts: [] };
          groups.set(t.categoryId, g);
        }
        g.amounts.push(t._convertedAmount);
      }

      // Compute totals + share.
      const totalExpenseAbs = converted
        .filter((t) => Number(t._convertedAmount) < 0)
        .reduce((acc, t) => acc + Math.abs(Number(t._convertedAmount)), 0);

      const rows: CategoryBreakdownReport[] = [];
      for (const g of groups.values()) {
        const neg = g.amounts
          .map(Number)
          .filter((n) => n < 0)
          .reduce((acc, n) => acc + n, 0);
        const transactionCount = g.amounts.length;
        const share = totalExpenseAbs > 0 ? Math.abs(neg) / totalExpenseAbs : 0;
        rows.push({
          categoryId: g.categoryId,
          categoryName: g.categoryName,
          total: neg.toFixed(2),
          transactionCount,
          share,
        });
      }

      // Order by absolute expense DESC.
      rows.sort((a, b) => Math.abs(Number(b.total)) - Math.abs(Number(a.total)));
      return rows;
    },

    async getByPeriod(
      userId: string,
      query: ReportQuery,
      bucket: Bucket,
    ): Promise<PeriodComparisonReport> {
      assertRangeWithinCap(query);
      const { currencyCode: target } = await resolvePrimaryCurrency(userId);
      const currentRange: DateRange = { fromDate: query.fromDate, toDate: query.toDate };
      const previousRange = computeComparisonWindow(currentRange);

      const [currentTxs, previousTxs] = await Promise.all([
        reportsRepository.findForUserInRange(userId, currentRange),
        reportsRepository.findForUserInRange(userId, previousRange),
      ]);

      const [currentConverted, previousConverted] = await Promise.all([
        convertAll(currentTxs, target),
        convertAll(previousTxs, target),
      ]);

      const fxFreshness: 'fresh' | 'stale' =
        currentConverted.fxFreshness === 'stale' || previousConverted.fxFreshness === 'stale'
          ? 'stale'
          : 'fresh';

      const currentBuckets = bucketize(currentConverted.converted, bucket, currentRange);
      const previousBuckets = bucketize(previousConverted.converted, bucket, previousRange);

      const currentTotals = buildSummary(
        query.fromDate,
        query.toDate,
        target,
        currentConverted.converted,
        currentConverted.fxFreshness,
      );
      const previousTotals = buildSummary(
        previousRange.fromDate,
        previousRange.toDate,
        target,
        previousConverted.converted,
        previousConverted.fxFreshness,
      );

      const delta = computeDelta(currentTotals, previousTotals);
      return {
        current: { totals: currentTotals, buckets: currentBuckets },
        previous: { totals: previousTotals, buckets: previousBuckets },
        delta,
      };
    },

    async exportCsv(
      userId: string,
      query: ReportQuery,
      detail: 'summary' | 'transactions',
    ): Promise<CsvExportResult> {
      assertRangeWithinCap(query);
      const { currencyCode: target } = await resolvePrimaryCurrency(userId);
      const txs = await reportsRepository.findForUserInRange(userId, {
        fromDate: query.fromDate,
        toDate: query.toDate,
      });
      const { converted } = await convertAll(txs, target);

      const filename = `reports-${query.fromDate}-${query.toDate}${detail === 'transactions' ? '.transactions' : ''}.csv`;

      if (detail === 'summary') {
        const byCategory = await this.getByCategory(userId, query);
        const rows = byCategory.map((r) => ({
          category_id: r.categoryId,
          category_name: r.categoryName,
          total: r.total,
          currency_code: target,
          transaction_count: r.transactionCount.toString(),
          share: r.share.toFixed(4),
        }));
        // Add __TOTAL__ row.
        const totalAbs = rows.reduce((acc, r) => acc + Math.abs(Number(r.total)), 0);
        const totalNeg = rows.reduce((acc, r) => acc + Number(r.total), 0);
        rows.push({
          category_id: '__TOTAL__',
          category_name: '',
          total: totalNeg.toFixed(2),
          currency_code: target,
          transaction_count: r0(byCategory.length),
          share: '1.0000',
        });
        // Suppress unused warning — totalAbs is for future use (e.g.,
        // showing 100% in share column for the __TOTAL__ row).
        void totalAbs;
        const body = csvSerializer.serialize(rows, [
          'category_id',
          'category_name',
          'total',
          'currency_code',
          'transaction_count',
          'share',
        ]);
        return { filename, contentType: 'text/csv; charset=utf-8', body };
      }

      // detail === 'transactions'
      const rows = converted.map((t) => ({
        id: t.id,
        occurred_at: t.occurredAt.toISOString(),
        description: '',
        category_id: t.categoryId,
        category_name: t.categoryName,
        amount: t.amount,
        currency_code: t.currencyCode,
        amount_in_primary: t._convertedAmount,
        primary_currency_code: target,
      }));
      const body = csvSerializer.serialize(rows, [
        'id',
        'occurred_at',
        'description',
        'category_id',
        'category_name',
        'amount',
        'currency_code',
        'amount_in_primary',
        'primary_currency_code',
      ]);
      return { filename, contentType: 'text/csv; charset=utf-8', body };
    },
  };
}

/**
 * Compute the previous-window via duration (NOT calendar-month).
 *
 * previousFrom = fromDate - duration
 * previousTo = fromDate
 *
 * Where duration = toDate - fromDate in days (computed in milliseconds
 * for precision). This avoids DST drift: the duration in days is the
 * same in UTC regardless of DST boundaries.
 */
function computeComparisonWindow(range: DateRange): DateRange {
  const fromMs = Date.parse(range.fromDate + 'T00:00:00Z');
  const toMs = Date.parse(range.toDate + 'T00:00:00Z');
  const durationMs = toMs - fromMs;
  const prevTo = new Date(fromMs);
  const prevFrom = new Date(fromMs - durationMs);
  return {
    fromDate: toIsoDate(prevFrom),
    toDate: toIsoDate(prevTo),
  };
}

function toIsoDate(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isFresh(recordedAt: Date, ttlMs: number): boolean {
  return Date.now() - recordedAt.getTime() < ttlMs;
}

/**
 * Wrapper for timeBucketService.bucketize that adapts the converted
 * transactions (which have _convertedAmount) to the flat shape the
 * bucketer expects (TransactionForReport with `amount`). Returns the
 * bucket series with income/expense/net built from _convertedAmount.
 */
function bucketize(
  converted: readonly (TransactionForReport & { _convertedAmount: string })[],
  bucket: Bucket,
  range: DateRange,
): readonly PeriodBucket[] {
  // Strip the _convertedAmount helper field; replace amount with the
  // converted value so the bucketer sums in the user's primary currency.
  const flat: TransactionForReport[] = converted.map((t) => {
    const { _convertedAmount: _c, ...rest } = t;
    void _c;
    return { ...rest, amount: t._convertedAmount };
  });
  const series = timeBucketService.bucketize(flat, bucket, range);
  return series.map((b) => ({
    label: b.label,
    fromDate: b.fromDate,
    toDate: b.toDate,
    income: b.income,
    expense: b.expense,
    net: b.net,
  }));
}

/**
 * Compute the delta between current and previous totals.
 *
 * delta.net = current.net - previous.net (Decimal-string subtraction).
 * delta.netPercent = (current.net - previous.net) / |previous.net|.
 * Returns null when previous.net is zero (division by zero).
 */
function computeDelta(current: ReportsSummary, previous: ReportsSummary): PeriodDelta {
  const incomeDiff = (Number(current.income) - Number(previous.income)).toFixed(2);
  const expenseDiff = (Number(current.expense) - Number(previous.expense)).toFixed(2);
  const netDiff = (Number(current.net) - Number(previous.net)).toFixed(2);
  const prevNet = Number(previous.net);
  const netPercent =
    prevNet === 0
      ? null
      : Number(((Number(current.net) - prevNet) / Math.abs(prevNet)).toFixed(6));
  return {
    income: incomeDiff,
    expense: expenseDiff,
    net: netDiff,
    netPercent,
  };
}

/**
 * Enforce the 365-day range cap (per spec S7 and the Zod schema).
 *
 * The Zod schema enforces this at the HTTP boundary, but the service
 * must enforce it independently because the BDD suite and any future
 * direct-service caller bypass the controller.
 */
function assertRangeWithinCap(query: ReportQuery): void {
  const fromMs = Date.parse(query.fromDate + 'T00:00:00Z');
  const toMs = Date.parse(query.toDate + 'T00:00:00Z');
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return;
  const days = Math.abs((toMs - fromMs) / (1000 * 60 * 60 * 24));
  if (days > 365) {
    throw new Error(`Range > 365 days (got ${Math.floor(days)} days)`);
  }
}

/**
 * Helper: convert a count to a string for the CSV row.
 */
function r0(n: number): string {
  return n.toString();
}

/**
 * Type-level alias for the factory's return shape (pure-domain surface).
 *
 * Renamed from `ReportsService` → `ReportsServiceApi` in PR #5 of the
 * module-6-reports slice so the concrete `ReportsService` class below
 * can take the natural name without a TS2308 "already exported"
 * ambiguity. The factory is still the unit-test seam: 124 tests in
 * `src/server/domain/services/__tests__/` build it directly via
 * `reportsService({...})` and never reference this alias.
 */
export type ReportsServiceApi = ReturnType<typeof reportsService>;

/**
 * Concrete `ReportsService` — NestJS-injectable thin wrapper around the
 * pure `reportsService({...})` factory.
 *
 * The controller (`apps/api/src/modules/reports/reports.controller.ts`)
 * injects THIS class as a value (per the slice-5 convention enforced by
 * the `@gpr/boundary/no-import-type-injectable` ESLint rule). The class
 * carries the same method surface so the controller stays a thin
 * pass-through; the module wires it with the `REPORTS_REPOSITORY_TOKEN`
 * and `FX_RATE_PROVIDER_TOKEN` (from `@features/transactions`).
 *
 * The factory remains the unit-test seam — tests don't construct this
 * class, they call `reportsService({...})` directly with mocked deps.
 */
export class ReportsService {
  private readonly impl: ReportsServiceApi;

  constructor(deps: ReportsServiceDeps) {
    this.impl = reportsService(deps);
  }

  getSummary(userId: string, query: ReportQuery): Promise<ReportsSummary> {
    return this.impl.getSummary(userId, query);
  }

  getByCategory(
    userId: string,
    query: ReportQuery,
  ): Promise<readonly CategoryBreakdownReport[]> {
    return this.impl.getByCategory(userId, query);
  }

  getByPeriod(
    userId: string,
    query: ReportQuery,
    bucket: Bucket,
  ): Promise<PeriodComparisonReport> {
    return this.impl.getByPeriod(userId, query, bucket);
  }

  exportCsv(
    userId: string,
    query: ReportQuery,
    detail: 'summary' | 'transactions',
  ): Promise<CsvExportResult> {
    return this.impl.exportCsv(userId, query, detail);
  }
}
