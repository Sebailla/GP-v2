import type { Decimal } from "@shared-utils/decimal";

import type {
  Transaction,
  TransactionKind,
  TransactionListItem,
} from "../entities/transaction.entity.js";

/**
 * Filter input for `TransactionRepository.list`. Mirrors the
 * `GET /transactions` query schema (`listSchema` in
 * `shared/schemas/list.ts`) plus server-side identity.
 *
 * Cursor pagination is intentional — the repository returns the next
 * cursor alongside the rows; clients feed it back as `cursor` to fetch
 * the next page.
 */
export interface TransactionListFilter {
  readonly userId: string;
  readonly cursor?: string;
  readonly pageSize?: number;
  readonly categoryId?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly currencyCode?: string;
  readonly kind?: TransactionKind;
}

/**
 * Insert input for `TransactionRepository.create`. The service layer
 * is responsible for FX lookup, `reportingAmount` computation,
 * soft-delete filter check on the category, audit log write, and
 * idempotency-key persistence — those happen BEFORE the call to
 * `create(input)`, which is the final persistence step on success.
 */
export interface TransactionCreate {
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
}

/**
 * Patch input for `TransactionRepository.update`. All fields optional;
 * the repository only writes the supplied columns. Re-FX is the
 * service's responsibility (called when `amount` or `currencyCode`
 * change), not the repository's.
 */
export interface TransactionUpdate {
  readonly amount?: Decimal;
  readonly currencyCode?: string;
  readonly kind?: TransactionKind;
  readonly reportingAmount?: Decimal | null;
  readonly reportingCurrencyCode?: string | null;
  readonly fxRateId?: string | null;
  readonly categoryId?: string;
  readonly notes?: string | null;
  readonly occurredAt?: Date;
  readonly updatedBy: string;
}

/**
 * Domain port for `Transaction` persistence.
 *
 * Like `CategoryRepository`, all read paths filter soft-deleted rows
 * (D-TX-5 — transactions are soft-deleted too). The implementation lives
 * at `infrastructure/repositories/prisma-transaction.repository.ts`
 * (PR #2 / T5.7).
 */
export interface TransactionRepository {
  /**
   * Look up a non-deleted transaction by id. Returns `null` for both
   * "id does not exist" and "id is soft-deleted".
   */
  findById(id: string): Promise<Transaction | null>;

  /**
   * Cursor-paginated list scoped to a single user. `filter.userId` is
   * required so the controller cannot accidentally list another user's
   * transactions. `nextCursor` is `null` when there are no more rows.
   */
      list(filter: TransactionListFilter): Promise<{
        rows: TransactionListItem[];
        total: number;
        cursor: string | null;
      }>;

      /**
       * Unpaginated query for service-level aggregation. Returns
       * every active (not soft-deleted) transaction matching the
       * filter. Used by `TotalsService.forUser` + `perCategory` —
       * both aggregate the full result set in memory. A production
       * deployment that needs aggregate over millions of rows
       * should push the aggregation to the DB (raw SQL or a
       * denormalized view); the slice ships the in-memory version
       * for clarity.
       */
      findManyForUser(
        userId: string,
        range: {
          readonly fromDate?: Date;
          readonly toDate?: Date;
        },
      ): Promise<Transaction[]>;

  /**
   * Persist a new transaction. The service has already done FX lookup,
   * category-active check, and audit-log preparation; this call is the
   * final write. Returns the persisted row including DB-assigned
   * `createdAt`/`updatedAt`.
   */
  create(input: TransactionCreate): Promise<Transaction>;

  /**
   * Patch an existing transaction by id. Soft-deleted rows cannot be
   * updated; the adapter treats them as not-found and surfaces the
   * same error as a true miss.
   */
  update(id: string, input: TransactionUpdate): Promise<Transaction>;

  /**
   * Soft-delete a transaction (`deletedAt = now`). Idempotent. The
   * `actorId` is recorded in the `updatedBy` column; the audit-log
   * entry is the service's responsibility (one row in `AuditLog` with
   * `action = "softDelete"`).
   */
  softDelete(id: string, actorId: string): Promise<void>;
}