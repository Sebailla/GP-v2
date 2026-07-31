import type { DateRange, TransactionForReport } from '../ports/index.js';
import type { IsoDate } from '../ports/types.js';

// Re-export `TransactionForReport` so test fixtures (which import
// from `../time-bucket.service.js`) don't need to reach into the ports barrel.
export type { TransactionForReport };

/**
 * Bucket granularity for time-series aggregations.
 * - 'week'  → ISO-8601 weeks (Mon-Sun), label format 'YYYY-Www'.
 * - 'month' → calendar months, label format 'YYYY-MM'.
 *
 * NOT 'day' or 'quarter' — those would be a separate slice.
 */
export type Bucket = 'week' | 'month';

/**
 * One bucket in a time series: the transactions that fell inside its
 * window plus the aggregation totals.
 *
 * `fromDate` / `toDate` are ISO-8601 strings (YYYY-MM-DD) describing
 * the bucket's calendar window. For 'week' buckets, the window starts
 * on Monday and ends on the following Sunday (both inclusive).
 */
export interface BucketSeriesPoint {
  readonly label: string;
  readonly fromDate: IsoDate;
  readonly toDate: IsoDate;
  readonly transactions: readonly TransactionForReport[];
  readonly income: string;     // Decimal-string sum of positive amounts
  readonly expense: string;    // Decimal-string sum of negative amounts (sign-aware)
  readonly net: string;        // Decimal-string sum of income + expense
}

/**
 * Convert a Date to an ISO-8601 date string (YYYY-MM-DD) in UTC.
 *
 * The server operates in UTC for simplicity; the client renders the
 * user's locale on top. See design.md §"Comparison window" — keeping
 * everything in UTC avoids DST drift in the period comparison.
 */
function toIsoDate(d: Date): IsoDate {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a Date to an ISO-8601 week label (YYYY-Www).
 *
 * ISO-8601 weeks start on Monday. The first week of a year is the one
 * that contains the first Thursday of that year (equivalently, the week
 * containing January 4th).
 */
function toIsoWeekLabel(d: Date): string {
  // Algorithm: copy the date, move to Thursday of the same ISO week,
  // then extract the ISO week-year and week number.
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7; // Sunday = 0 → 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Convert a Date to a YYYY-MM month label.
 */
function toMonthLabel(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Compute the start (Monday) and end (Sunday) of the ISO week containing
 * the given date, both as YYYY-MM-DD strings.
 *
 * The returned toDate is EXCLUSIVE — it equals the Monday of the
 * following ISO week, so buckets abut without overlap (the same
 * half-open convention as the overall range filter).
 */
function isoWeekBounds(d: Date): { fromDate: IsoDate; toDate: IsoDate } {
  const dayNum = d.getUTCDay() || 7; // Sunday = 0 → 7
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - (dayNum - 1));
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return { fromDate: toIsoDate(monday), toDate: toIsoDate(nextMonday) };
}

/**
 * Compute the start (1st) and exclusive end (1st of next month) of the
 * month containing the given date. The end is EXCLUSIVE — it equals
 * the 1st of the following month, so buckets abut without overlap.
 */
function monthBounds(d: Date): { fromDate: IsoDate; toDate: IsoDate } {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  return { fromDate: toIsoDate(first), toDate: toIsoDate(next) };
}

/**
 * Sum an array of Decimal-strings via a fixed-point arithmetic trick.
 *
 * For the MVP we parse to JS numbers and back. This is safe up to
 * ±1e15 which is way beyond any reasonable user's transaction total.
 * If the slice ever scales to multi-million-dollar balances, swap to
 * `@shared-utils/decimal`.
 */
function sumAmounts(amounts: readonly string[]): string {
  let total = 0;
  for (const a of amounts) {
    total += Number(a);
  }
  // Always emit a Decimal string with at most 2 decimal places.
  return total.toFixed(2);
}

/**
 * Pure-domain time-bucketing service. No I/O, no Prisma, no clock
 * dependency (the test passes fixed dates).
 *
 * The service is intentionally synchronous over an in-memory array of
 * transactions. For large datasets, the slice could be extended with
 * a database-side bucketing query in a future PR; for the MVP, in-memory
 * is correct and trivially testable.
 */
export const timeBucketService = {
  /**
   * Group transactions into time buckets of the given granularity,
   * filtered by the half-open range [range.fromDate, range.toDate).
   *
   * Returns buckets in chronological order (oldest first). Each
   * bucket aggregates income, expense, and net via Decimal string sums.
   *
   * Inverted ranges (fromDate > toDate) return [].
   * Empty input arrays return [].
   */
  bucketize(
    transactions: readonly TransactionForReport[],
    bucket: Bucket,
    range: DateRange,
  ): readonly BucketSeriesPoint[] {
    // Range filter (half-open [fromDate, toDate) INCLUSIVE on both
    // calendar days). The `toDate` is the exclusive end of the
    // interval at the day level; we bump it to the start of the
    // next day so transactions on the `toDate` calendar day are
    // included. Matches the in-memory + Prisma adapter semantics.
    const fromMs = Date.parse(range.fromDate + 'T00:00:00Z');
    const toExclusiveMs = Date.parse(range.toDate + 'T00:00:00Z');
    const toMs = toExclusiveMs + 24 * 60 * 60 * 1000;
    if (Number.isNaN(fromMs) || Number.isNaN(toExclusiveMs) || fromMs >= toExclusiveMs) {
      return [];
    }

    const filtered = transactions.filter((t) => {
      const ms = t.occurredAt.getTime();
      return ms >= fromMs && ms < toMs;
    });

    // Group by bucket key.
    type Mutable = {
      label: string;
      fromDate: IsoDate;
      toDate: IsoDate;
      transactions: TransactionForReport[];
      incomeAmounts: string[];
      expenseAmounts: string[];
    };

    const byKey = new Map<string, Mutable>();
    for (const t of filtered) {
      const label = bucket === 'week' ? toIsoWeekLabel(t.occurredAt) : toMonthLabel(t.occurredAt);
      const bounds = bucket === 'week' ? isoWeekBounds(t.occurredAt) : monthBounds(t.occurredAt);

      let entry = byKey.get(label);
      if (!entry) {
        entry = {
          label,
          fromDate: bounds.fromDate,
          toDate: bounds.toDate,
          transactions: [],
          incomeAmounts: [],
          expenseAmounts: [],
        };
        byKey.set(label, entry);
      }
      entry.transactions.push(t);
      const amount = Number(t.amount);
      if (amount >= 0) {
        entry.incomeAmounts.push(t.amount);
      } else {
        entry.expenseAmounts.push(t.amount);
      }
    }

    // Sort by label (lexicographic order matches chronological for both
    // 'YYYY-MM' and 'YYYY-Www' formats — W is fixed-width so numeric
    // comparisons are preserved).
    const sorted = Array.from(byKey.values()).sort((a, b) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0,
    );

    return sorted.map((entry): BucketSeriesPoint => {
      const income = sumAmounts(entry.incomeAmounts);
      const expense = sumAmounts(entry.expenseAmounts);
      // Net = income + expense (expense is already negative, so this is
      // income - |expense|). Use string concatenation of the toFixed
      // values via parseFloat to keep precision.
      const net = (Number(income) + Number(expense)).toFixed(2);
      return {
        label: entry.label,
        fromDate: entry.fromDate,
        toDate: entry.toDate,
        transactions: entry.transactions,
        income,
        expense,
        net,
      };
    });
  },
};

export type TimeBucketService = typeof timeBucketService;
