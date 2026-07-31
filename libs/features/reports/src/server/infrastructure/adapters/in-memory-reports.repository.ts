import type { DateRange, ReportsRepository, TransactionForReport } from '../../domain/ports/index.js';

/**
 * In-memory implementation of `ReportsRepository`.
 *
 * Useful for tests and local development without a Postgres instance.
 * The slice's BDD bridge (PR #4) and the controller e2e tests (PR #3)
 * use this adapter; the production Prisma adapter is a separate concern
 * that ships in a future slice (the worktree's strict pnpm workspace
 * resolution + Prisma client generation step block running it from
 * this branch).
 *
 * The store is a simple Map keyed by userId. Soft-deleted categories
 * are simulated by skipping rows whose categoryId is in
 * `deletedCategoryIds`. The half-open range filter is implemented
 * identically to the production Prisma adapter.
 */
export class InMemoryReportsRepository implements ReportsRepository {
  private readonly transactionsByUser = new Map<string, TransactionForReport[]>();
  private readonly deletedCategoryIds = new Set<string>();
  private readonly primaryCurrencyByUser = new Map<string, string>();

  /**
   * Seed a user's transactions for a range. Useful for tests.
   */
  seedTransactions(userId: string, transactions: readonly TransactionForReport[]): void {
    this.transactionsByUser.set(userId, [...transactions]);
  }

  /**
   * Mark a category as soft-deleted (simulates the Prisma invariant).
   */
  softDeleteCategory(categoryId: string): void {
    this.deletedCategoryIds.add(categoryId);
  }

  /**
   * Set the user's primary currency.
   */
  setPrimaryCurrency(userId: string, currencyCode: string): void {
    this.primaryCurrencyByUser.set(userId, currencyCode);
  }

  async findForUserInRange(
    userId: string,
    range: DateRange,
  ): Promise<readonly TransactionForReport[]> {
    const fromMs = Date.parse(range.fromDate + 'T00:00:00Z');
    // `toDate` is the exclusive end of the half-open interval. To
    // include all transactions on the `toDate` calendar day, we
    // bump it to the start of the NEXT day (UTC midnight). This
    // matches the Prisma adapter's `lt: nextDayMidnight` query.
    const toExclusiveMs = Date.parse(range.toDate + 'T00:00:00Z');
    const toMs = toExclusiveMs + 24 * 60 * 60 * 1000;
    if (Number.isNaN(fromMs) || Number.isNaN(toExclusiveMs) || fromMs >= toExclusiveMs) return [];

    const all = this.transactionsByUser.get(userId) ?? [];
    return all
      .filter((t) => {
        if (this.deletedCategoryIds.has(t.categoryId)) return false;
        const ms = t.occurredAt.getTime();
        return ms >= fromMs && ms < toMs;
      })
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async findPrimaryCurrencyForUser(userId: string): Promise<string | null> {
    return this.primaryCurrencyByUser.get(userId) ?? null;
  }
}
