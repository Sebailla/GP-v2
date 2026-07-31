import { prisma as defaultPrisma } from "@core/database";
import type { Prisma, PrismaClient, PrismaDecimal } from "@core/database";

import type {
  DateRange,
  ReportsRepository,
  TransactionForReport,
} from "../../domain/ports/index.js";
import type { CurrencyCode } from "../../domain/ports/types.js";

/**
 * Prisma adapter for `ReportsRepository`.
 *
 * Implements the two read-only operations the reports slice needs:
 * - `findForUserInRange(userId, range)` — returns a half-open
 *   `[fromDate, toDate)` slice of the user's transactions, projected
 *   to the flat `TransactionForReport` shape the reports domain
 *   consumes. Soft-deleted rows are filtered (D-TX-5 invariant).
 * - `findPrimaryCurrencyForUser(userId)` — returns the currency code
 *   the user has configured for reporting aggregation. Resolved
 *   from the `UserPreference` table (one row per user).
 *
 * Cross-user isolation: every read filters `where: { createdBy: userId }`,
 * so a foreign-owned row is indistinguishable from a missing row (no
 * information leak on "exists vs. mine" — D-TX-7).
 *
 * Sign-aware amount: Prisma's `Transaction.amount` is always positive
 * magnitude; the sign comes from `kind`. The adapter projects to
 * `TransactionForReport.amount` (sign-aware Decimal-string) at the
 * boundary, so the service layer can sum income vs. expense without
 * reading the `kind` column.
 *
 * Decimal boundary: the domain uses `string` (Decimal-string); the
 * adapter does not convert through `@shared-utils/decimal` here
 * because the receiving `ReportsService` re-parses on consumption
 * via `toDecimal(...)` (decision #1 amendment: not delegated to
 * `TotalsService`). The conversion convention is `amount.toString()`
 * with a leading `-` for `kind === 'expense'`.
 *
 * Production wiring: this class lives on the `REPORTS_REPOSITORY_TOKEN`
 * provider in `apps/api/src/modules/reports/reports.module.ts`. The
 * `InMemoryReportsRepository` is the test/dev binding.
 */
export class PrismaReportsRepository implements ReportsRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async findForUserInRange(
    userId: string,
    range: DateRange,
  ): Promise<readonly TransactionForReport[]> {
    // Half-open interval semantics: [fromDate, toDate) INCLUSIVE on
    // both calendar days. The spec says "toDate is exclusive" but
    // that refers to the calendar day, not the millisecond. To
    // include all transactions of `toDate`, we bump it to the start
    // of the NEXT day (00:00:00Z). This matches the in-memory
    // adapter's behavior exactly (it also uses `occurredAt < start
    // of toDate + 1 day`).
    const fromDate = new Date(`${range.fromDate}T00:00:00.000Z`);
    const toDateExclusive = new Date(`${range.toDate}T00:00:00.000Z`);
    const toDate = new Date(toDateExclusive.getTime() + 24 * 60 * 60 * 1000);

    const where: Prisma.TransactionWhereInput = {
      createdBy: userId,
      deletedAt: null,
      // Half-open interval [fromDate, toDate). Mirrors the
      // in-memory adapter's behavior exactly.
      occurredAt: { gte: fromDate, lt: toDate },
    };

    const rows = await this.prisma.transaction.findMany({
      where,
      include: { category: true },
      // Order ASC so the time-bucketing downstream produces buckets
      // in chronological order (matches the in-memory adapter).
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });

    return rows.map(projectTransactionForReport);
  }

  async findPrimaryCurrencyForUser(userId: string): Promise<CurrencyCode | null> {
    const row = await this.prisma.userPreference.findUnique({ where: { userId } });
    if (row === null) {
      return null;
    }
    return row.primaryCurrencyCode as CurrencyCode | null;
  }
}

/**
 * Project a Prisma `Transaction` row (with the `category` relation
 * included) to the flat `TransactionForReport` shape.
 *
 * The `amount` column is always positive magnitude; sign is in `kind`.
 * The `TransactionForReport.amount` is a sign-aware Decimal-string so
 * the downstream `ReportsService` can sum income vs. expense without
 * reading the `kind` column.
 */
function projectTransactionForReport(row: {
  id: string;
  amount: PrismaDecimal;
  currencyCode: string;
  kind: string;
  categoryId: string;
  occurredAt: Date;
  createdBy: string;
  category: { id: string; name: string };
}): TransactionForReport {
  // Prisma's runtime Decimal emits `amount.toString()` without trailing
  // zeros (e.g. `"100"` instead of `"100.00"`). The
  // `TransactionForReport.amount` contract is a Decimal-string with 2
  // decimal places (matches the in-memory adapter's storage shape and
  // the downstream `ReportsService` aggregation expectations). Pad
  // the magnitude to 2 decimals before applying the sign.
  const magnitude = row.amount.toFixed(2);
  const signed = row.kind === "expense" ? `-${magnitude}` : magnitude;
  return {
    id: row.id,
    userId: row.createdBy,
    occurredAt: row.occurredAt,
    amount: signed,
    currencyCode: row.currencyCode as CurrencyCode,
    categoryId: row.categoryId,
    categoryName: row.category.name,
  };
}
