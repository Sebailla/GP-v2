import type { Decimal } from "@shared-utils/decimal";

import type {
	Transaction,
	TransactionKind,
	TransactionListItem,
} from "../entities/transaction.entity.js";
import type { UnitOfWorkContext } from "./unit-of-work.js";

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
 *
 * R3-002 / R4-005: the optional `tx` parameter is the unit-of-work
 * context. When the caller wraps the create call inside a
 * `unitOfWork.run(...)` boundary, the repository forwards `tx` to
 * the underlying Prisma call so the row-persist participates in
 * the same transactional boundary as the audit-log append and the
 * idempotency-cache write. Outside a unit-of-work, `tx` is `undefined`
 * and the adapter uses its own `PrismaClient`.
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
 *
 * R3-002 / R4-005: the write methods (`create`, `update`, `softDelete`,
 * `appendAuditLog`) accept an optional `tx` (UnitOfWorkContext) so the
 * service can compose multiple writes into one atomic boundary when
 * the strict atomicity invariant applies.
 */
export interface TransactionRepository {
	/**
	 * Look up a non-deleted transaction by id. Returns `null` for both
	 * "id does not exist" and "id is soft-deleted". The `userId`
	 * argument is REQUIRED on every read path: foreign-owned rows are
	 * indistinguishable from missing rows (D-TX-7 — no information
	 * leak on "exists vs. mine").
	 */
	findByIdForUser(id: string, userId: string): Promise<Transaction | null>;

	/**
	 * Look up ANY transaction (active OR soft-deleted) by id, scoped
	 * to a user. Used by `service.softDelete` to distinguish
	 * "already tombstoned" (silent 204) from "missing or
	 * foreign-owned" (404). The `userId` filter still enforces
	 * D-TX-7 ownership; a foreign-owned tombstoned row returns
	 * `null` so the caller cannot distinguish "exists-vs-mine" for
	 * deleted rows either.
	 */
	findByIdForUserIncludingDeleted(
		id: string,
		userId: string,
	): Promise<Transaction | null>;

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
	 * `createdAt`/`updatedAt`. The optional `tx` (UnitOfWorkContext)
	 * participates the call in a service-level atomic boundary when
	 * supplied.
	 */
	create(
		input: TransactionCreate,
		tx?: UnitOfWorkContext,
	): Promise<Transaction>;

	/**
	 * Patch an existing transaction by id. The `userId` argument
	 * enforces D-TX-7 ownership — only the row's `createdBy` may patch
	 * it; the adapter translates a missing row OR a foreign-owned row
	 * to a single `TransactionNotFoundError` (no information leak on
	 * "exists vs. mine"). Soft-deleted rows cannot be updated; the
	 * adapter treats them as not-found. The optional `tx` participates
	 * in a service-level atomic boundary when supplied.
	 */
	update(
		id: string,
		userId: string,
		input: TransactionUpdate,
		tx?: UnitOfWorkContext,
	): Promise<Transaction>;

	/**
	 * Soft-delete a transaction (`deletedAt = now`). The `userId`
	 * argument enforces D-TX-7 ownership — only the row's `createdBy`
	 * may soft-delete it; the adapter translates a missing row OR a
	 * foreign-owned row to a single `TransactionNotFoundError` (no
	 * information leak on "exists vs. mine"). The `userId` is also
	 * recorded in the `updatedBy` column as the deletion actor; the
	 * audit-log entry is the service's responsibility (one row in
	 * `AuditLog` with `action = "softDelete"`).
	 */
	softDelete(id: string, userId: string, tx?: UnitOfWorkContext): Promise<void>;
}
