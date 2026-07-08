import type { Decimal } from "@shared-utils/decimal";

/**
 * Domain entity: `Transaction`.
 *
 * Mirrors the `Transaction` model in
 * `libs/core/database/prisma/schema.prisma`. Monetary fields use
 * `@shared-utils/decimal`'s `Decimal` (a `decimal.js` instance) — the
 * Prisma adapter converts its own runtime `Decimal` to this shape at
 * the data-layer boundary so the domain layer keeps a single numeric
 * vocabulary (D-TX-6; we never use `BigInt` — it silently truncates cents).
 *
 * Sign convention:
 *  - `amount` is always positive; the magnitude of the transaction.
 *  - `kind` carries the sign: `'expense'` means a debit (totals subtract),
 *    `'income'` means a credit (totals add). The TotalsService owns the
 *    sign translation; this column never stores a negative value.
 *
 * Reporting fields:
 *  - `reportingAmount`, `reportingCurrencyCode`, `fxRateId` are populated
 *    when the transaction's native currency differs from the user's
 *    reporting currency (see design §5.1 and D-TX-3 for the same-currency
 *    skip rule). They are nullable for the same-currency case.
 *
 * Soft-delete:
 *  - `deletedAt` is nullable; non-null rows are tombstoned. Reads MUST
 *    filter `deletedAt IS NULL` (mirrors the D-TX-5 policy on categories).
 */
export type TransactionKind = "income" | "expense";

export interface Transaction {
  readonly id: string;
  readonly amount: Decimal;
  readonly currencyCode: string;
  readonly kind: TransactionKind;
  readonly reportingAmount: Decimal | null;
  readonly reportingCurrencyCode: string | null;
  readonly fxRateId: string | null;
  readonly categoryId: string;
  readonly notes: string | null;
  readonly occurredAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/**
 * Output projection for `TransactionRepository.list`. Strips heavy
 * columns (notes on bulk rows, future audit expansion) so list endpoints
 * stay cheap. Caller code that needs `notes` or `createdBy` fetches the
 * full row via `findById`.
 */
export type TransactionListItem = Omit<Transaction, "notes" | "createdBy" | "updatedBy">;
