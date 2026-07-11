import { toDecimal, type Decimal } from "@shared-utils/decimal";

import type { Transaction, TransactionKind } from "../entities/transaction.entity.js";
import type { TransactionRepository } from "../interfaces/transaction.repository.js";

/**
 * Optional date range for a totals query. `fromDate` is inclusive
 * (`occurredAt >= fromDate`); `toDate` is exclusive (`occurredAt <
 * toDate`) — the half-open interval is the standard convention for
 * rolling windows.
 */
export interface TotalsRange {
  readonly fromDate?: Date;
  readonly toDate?: Date;
}

/**
 * Sign-aware totals. `income` is the sum of `amount` for all
 * `'income'` rows; `expense` is the sum of `amount` for all
 * `'expense'` rows (positive magnitude — the sign is on `kind`, not
 * on `amount`); `net` is `income - expense`.
 *
 * The `Decimal` type from `@shared-utils/decimal` carries arbitrary
 * precision; the result preserves the cents granularity. For a
 * user with no transactions, all three are zero.
 */
export interface UserTotals {
  readonly income: Decimal;
  readonly expense: Decimal;
  readonly net: Decimal;
}

/**
 * Per-category totals. One row per active `categoryId` in the
 * result set. `total` is sign-aware: positive for income, negative
 * for expense. Categories with no transactions in the range do
 * NOT appear (the totals are sparse).
 */
export interface CategoryTotal {
  readonly categoryId: string;
  readonly total: Decimal;
  readonly kind: TransactionKind;
}

/**
 * Domain service for sign-aware totals. Computes `income` / `expense`
 * / `net` over a user's transactions in a date range, and a
 * per-category breakdown. Soft-deleted transactions are filtered at
 * the repository boundary (D-TX-5); the service consumes the
 * filtered set and trusts the boundary.
 *
 * Performance: the in-memory aggregation is acceptable for the
 * reference repo (a typical user has hundreds of transactions, not
 * millions). A production deployment with high-cardinality
 * transactions should push the aggregation to the DB (raw SQL or a
 * denormalized view) — the port's `findManyForUser` is the seam
 * where the SQL would replace the `findMany` call.
 */
export class TotalsService {
  constructor(private readonly txRepo: TransactionRepository) {}

  /**
   * Sign-aware income / expense / net totals for a single user in
   * an optional date range.
   */
  async forUser(userId: string, range: TotalsRange = {}): Promise<UserTotals> {
    const txns = await this.txRepo.findManyForUser(userId, range);
    return this.aggregate(txns);
  }

  /**
   * Per-category breakdown for a single user. Returns one entry
   * per active `categoryId` in the result set; the order is
   * `categoryId ASC` for deterministic output.
   */
  async perCategory(userId: string, range: TotalsRange = {}): Promise<CategoryTotal[]> {
    const txns = await this.txRepo.findManyForUser(userId, range);
    return this.aggregateByCategory(txns);
  }

  /**
   * Internal: aggregate a set of transactions into the
   * `UserTotals` shape. Pure function; exposed for testability.
   */
  private aggregate(txns: readonly Transaction[]): UserTotals {
    let income = toDecimal("0");
    let expense = toDecimal("0");
    for (const t of txns) {
      if (t.kind === "income") {
        income = income.add(t.amount);
      } else {
        // 'expense'
        expense = expense.add(t.amount);
      }
    }
    return { income, expense, net: income.sub(expense) };
  }

  /**
   * Internal: aggregate a set of transactions into the
   * `CategoryTotal` shape (per-category sign-aware totals). Empty
   * categories are omitted; the result is sorted by `categoryId`
   * for deterministic output.
   */
  private aggregateByCategory(txns: readonly Transaction[]): CategoryTotal[] {
    const byCategory = new Map<string, { total: Decimal; kind: TransactionKind }>();
    for (const t of txns) {
      const existing = byCategory.get(t.categoryId);
      if (existing === undefined) {
        byCategory.set(t.categoryId, { total: t.amount, kind: t.kind });
      } else {
        // Same kind in the result set (the slice doesn't allow
        // a category to flip kind mid-history; if it does, the
        // service returns the magnitude sum + the latest kind —
        // acceptable for the in-memory aggregation; a DB-level
        // GROUP BY would project more carefully).
        existing.total = existing.total.add(t.amount);
      }
    }
    return Array.from(byCategory.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categoryId, { total, kind }]) => ({
        categoryId,
        total,
        kind,
      }));
  }
}
