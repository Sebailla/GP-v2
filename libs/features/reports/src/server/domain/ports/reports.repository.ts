/**
 * Domain port for the Reports & Analytics surface.
 *
 * Reports are read-only at the data layer (no Prisma writes, no event
 * emission). This port is the seam between the ReportsService (domain
 * orchestration) and any concrete repository implementation. The
 * canonical impl is `PrismaReportsRepository` (PR #3), which delegates
 * to the existing `@features/transactions` ports (PrismaTransactionRepository,
 * PrismaCategoryRepository, PrismaCurrencyRepository).
 *
 * Per the boundary ESLint plugin's `no-cross-module-import` rule, this
 * port must NOT import from `@features/transactions/server`. The shape
 * here is intentionally narrow: it returns a flat list of
 * `TransactionForReport` records, not the transactions domain entity.
 * The ReportsService adapts the flat list to its aggregation needs.
 *
 * Cross-user isolation: every method takes a `userId`. Implementations
 * MUST filter every query by `where: { createdBy: userId }`. This is
 * tested in PR #3 via the cross-user isolation integration test.
 */

import type {
  CurrencyCode,
  IsoDate,
  UserId,
} from './types.js';

import type { CategoryId } from './types.js';

/**
 * Flat transaction projection tailored for reporting. Smaller than
 * `@features/transactions`'s `Transaction` entity — only the fields
 * the reports need to do time-bucketing + per-category aggregation.
 */
export interface TransactionForReport {
  readonly id: string;
  readonly userId: UserId;
  readonly occurredAt: Date;
  readonly amount: string;          // Decimal-string; sign-aware (income > 0, expense < 0)
  readonly currencyCode: CurrencyCode;
  readonly categoryId: CategoryId;
  readonly categoryName: string;    // resolved at the port boundary, not the entity boundary
}

export interface DateRange {
  readonly fromDate: IsoDate;
  readonly toDate: IsoDate;
}

export interface ReportsRepository {
  /**
   * Returns all transactions in the user's range.
   *
   * - Inverted ranges (fromDate > toDate) return `[]`.
   * - Empty ranges return `[]`.
   * - Soft-deleted categories are excluded (CategoryRepository invariant).
   * - The result is ordered by `occurredAt` ASC (oldest first), so the
   *   TimeBucketService can produce buckets in chronological order.
   */
  findForUserInRange(
    userId: UserId,
    range: DateRange,
  ): Promise<readonly TransactionForReport[]>;

  /**
   * Resolves the user's primary reporting currency.
   *
   * - Returns `null` if the user has not set a primary currency (then
   *   the ReportsService falls back to USD with a console.warn + an
   *   observability counter).
   * - Implementations may look up `Currency` rows where
   *   `userId = userId AND isPrimary = true`, or use a `UserPreference`
   *   table if one exists.
   */
  findPrimaryCurrencyForUser(userId: UserId): Promise<CurrencyCode | null>;
}
