import {
	prisma as defaultPrisma,
	isPrismaUniqueViolation,
	TransactionIsolationLevel,
} from "@core/database";
import type { Prisma, PrismaClient, PrismaDecimal } from "@core/database";
import { toDecimal } from "@shared-utils/decimal";

import type { Transaction } from "../../domain/entities/transaction.entity.js";
import type {
	TransactionRepository,
	TransactionListFilter,
	TransactionCreate,
	TransactionUpdate,
} from "../../domain/interfaces/transaction.repository.js";
import type { UnitOfWorkContext } from "../../domain/interfaces/unit-of-work.js";

/**
 * Prisma adapter for `TransactionRepository`.
 *
 * Mirrors the slice-wide soft-delete convention from
 * `PrismaCategoryRepository` (D-TX-5): every read query path filters
 * `where: { deletedAt: null }`, AND the `update` path runs the pre-check
 * + the update inside a `SERIALIZABLE` `$transaction` so a concurrent
 * `softDelete` between the two operations cannot land an update on a
 * tombstoned row. Postgres aborts the second transaction with a
 * serialization failure (Prisma surfaces as `P2034`); the outer
 * try/catch translates that to `TransactionNotFoundError` so the
 * domain layer never sees a raw Prisma error.
 *
 * Decimal boundary: the domain uses `@shared-utils/decimal`'s
 * `Decimal` (decimal.js); Prisma emits its own runtime `Decimal` from
 * the generated client. The adapter owns the conversion at the
 * boundary (`toDecimal(row.amount.toString())` on read;
 * `input.amount.toString()` on write). Any drift breaks the contract
 * and the integration tests.
 *
 * Cursor pagination: the repository returns an opaque cursor string
 * when more rows exist. The cursor is the `id` of the last row of the
 * current page (Prisma's stable cursor-pagination pattern); the
 * service passes it back as `filter.cursor` to fetch the next page.
 */
export class PrismaTransactionRepository implements TransactionRepository {
	private readonly prisma: PrismaClient;

	constructor(prisma?: PrismaClient) {
		this.prisma = prisma ?? defaultPrisma;
	}

	async findByIdForUser(
		id: string,
		userId: string,
	): Promise<Transaction | null> {
		// D-TX-5 + D-TX-7: filter by `createdBy = userId` so the read
		// returns `null` for foreign-owned rows (no information leak).
		const row = await this.prisma.transaction.findFirst({
			where: { id, createdBy: userId, deletedAt: null },
		});
		return row === null ? null : projectTransaction(row);
	}

	async findByIdForUserIncludingDeleted(
		id: string,
		userId: string,
	): Promise<Transaction | null> {
		// D-TX-7 ownership check; deliberately ignores `deletedAt` so
		// `service.softDelete` can distinguish "owned but already
		// tombstoned" (silent 204 — idempotent re-delete) from
		// "missing or foreign-owned" (404). Foreign-owned tombstoned
		// rows still appear as `null` because the `createdBy = userId`
		// filter rejects them — no information leak on "exists vs.
		// mine".
		const row = await this.prisma.transaction.findFirst({
			where: { id, createdBy: userId },
		});
		return row === null ? null : projectTransaction(row);
	}

	async list(filter: TransactionListFilter): Promise<{
		rows: Transaction[];
		total: number;
		cursor: string | null;
	}> {
		const where: Prisma.TransactionWhereInput = {
			createdBy: filter.userId,
			deletedAt: null,
		};
		if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
		if (filter.currencyCode !== undefined)
			where.currencyCode = filter.currencyCode;
		if (filter.kind !== undefined) where.kind = filter.kind;
		if (filter.fromDate !== undefined || filter.toDate !== undefined) {
			where.occurredAt = {};
			if (filter.fromDate !== undefined) {
				(where.occurredAt as Prisma.DateTimeFilter).gte = filter.fromDate;
			}
			if (filter.toDate !== undefined) {
				(where.occurredAt as Prisma.DateTimeFilter).lt = filter.toDate;
			}
		}

		const take = filter.pageSize ?? 20;

		const rows = await this.prisma.transaction.findMany({
			where,
			orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
			take: take + 1,
			...(filter.cursor !== undefined
				? { cursor: { id: filter.cursor }, skip: 1 }
				: {}),
		});

		const hasMore = rows.length > take;
		const pageRows = hasMore ? rows.slice(0, take) : rows;
		const cursor = hasMore ? pageRows[pageRows.length - 1]!.id : null;

		const total = await this.prisma.transaction.count({ where });

		return {
			rows: pageRows.map(projectTransaction),
			total,
			cursor,
		};
	}

	async findManyForUser(
		userId: string,
		range: { readonly fromDate?: Date; readonly toDate?: Date },
	): Promise<Transaction[]> {
		const where: Prisma.TransactionWhereInput = {
			createdBy: userId,
			deletedAt: null,
		};
		if (range.fromDate !== undefined || range.toDate !== undefined) {
			where.occurredAt = {};
			if (range.fromDate !== undefined) {
				(where.occurredAt as Prisma.DateTimeFilter).gte = range.fromDate;
			}
			if (range.toDate !== undefined) {
				(where.occurredAt as Prisma.DateTimeFilter).lt = range.toDate;
			}
		}

		const rows = await this.prisma.transaction.findMany({
			where,
			orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
		});
		return rows.map(projectTransaction);
	}

	async create(
		input: TransactionCreate,
		tx?: UnitOfWorkContext,
	): Promise<Transaction> {
		try {
			const row = await (
				(tx?.tx as PrismaClient | undefined) ?? this.prisma
			).transaction.create({
				data: {
					amount: input.amount.toString(),
					currencyCode: input.currencyCode,
					kind: input.kind,
					reportingAmount:
						input.reportingAmount === null
							? null
							: input.reportingAmount.toString(),
					reportingCurrencyCode: input.reportingCurrencyCode,
					fxRateId: input.fxRateId,
					categoryId: input.categoryId,
					notes: input.notes,
					occurredAt: input.occurredAt,
					createdBy: input.createdBy,
					updatedBy: input.updatedBy,
				},
			});
			return projectTransaction(row);
		} catch (err) {
			// P2002 translation: today the schema has no `@@unique(...)` on
			// Transaction (idempotency is enforced via `IdempotencyKey`, not
			// on the Transaction row itself). The translation is wired now so
			// any future `@@unique(...)` cannot leak the raw Prisma error.
			// The `isPrismaUniqueViolation` call uses a placeholder target
			// field name; the day a real unique constraint lands, the target
			// updates here and the test suite locks the new translation.
			// `isPrismaUniqueViolation` uses an "includes" semantic for
			// compound `@@unique([a, b])` violations — if a future unique
			// spans multiple fields, pass the specific target you want to
			// match (e.g. pass `"userId"` to detect a violation that *involves*
			// userId, even if the violation is on a compound index).
			if (isPrismaUniqueViolation(err, "id")) {
				throw new TransactionAlreadyExistsError(
					"Transaction violates a unique constraint (placeholder target: 'id')",
				);
			}
			throw err;
		}
	}

	async update(
		id: string,
		userId: string,
		input: TransactionUpdate,
		tx?: UnitOfWorkContext,
	): Promise<Transaction> {
		// D-TX-5 + D-TX-7 invariants: refuse to update soft-deleted rows
		// OR foreign-owned rows. Pre-check + update run inside a
		// SERIALIZABLE `$transaction` so a concurrent `softDelete` between
		// the two operations is serialized. Postgres aborts the second
		// transaction with a serialization failure (Prisma `P2034`); the
		// outer try/catch translates `P2034` to `TransactionNotFoundError`
		// so the domain layer sees a clean not-found signal. Without
		// SERIALIZABLE the read-then-update pattern has a TOCTOU window
		// where the update can land on a now-soft-deleted row.
		//
		// The `userId` filter on the where clause implements D-TX-7
		// (only the row's `createdBy` may patch it). A foreign-owned row
		// looks identical to a missing row to the caller — no information
		// leak on "exists vs. mine".
		try {
			const db = (tx?.tx as PrismaClient | undefined) ?? this.prisma;
			return await db.$transaction(
				async (innerTx) => {
					const existing = await innerTx.transaction.findFirst({
						where: { id, createdBy: userId, deletedAt: null },
					});
					if (existing === null) {
						throw new TransactionNotFoundError(id);
					}

					const data: Prisma.TransactionUncheckedUpdateInput = {
						updatedBy: input.updatedBy,
					};
					if (input.amount !== undefined) data.amount = input.amount.toString();
					if (input.currencyCode !== undefined)
						data.currencyCode = input.currencyCode;
					if (input.kind !== undefined) data.kind = input.kind;
					if (input.reportingAmount !== undefined) {
						data.reportingAmount =
							input.reportingAmount === null
								? null
								: input.reportingAmount.toString();
					}
					if (input.reportingCurrencyCode !== undefined) {
						data.reportingCurrencyCode = input.reportingCurrencyCode;
					}
					if (input.fxRateId !== undefined) data.fxRateId = input.fxRateId;
					if (input.categoryId !== undefined)
						data.categoryId = input.categoryId;
					if (input.notes !== undefined) data.notes = input.notes;
					if (input.occurredAt !== undefined)
						data.occurredAt = input.occurredAt;

					const row = await innerTx.transaction.update({
						where: { id },
						data,
					});
					return projectTransaction(row);
				},
				{
					isolationLevel: TransactionIsolationLevel.Serializable,
					maxWait: 5_000,
					timeout: 10_000,
				},
			);
		} catch (err) {
			// Translate Postgres serialization failure (Prisma P2034) to
			// `TransactionNotFoundError` so the domain layer never sees a raw
			// Prisma error on the D-TX-5 update path. The serialization
			// failure is the documented outcome of a concurrent `softDelete`
			// winning the SERIALIZABLE race; semantically the row is
			// soft-deleted from this transaction's perspective.
			if (isPrismaSerializationFailure(err)) {
				throw new TransactionNotFoundError(id);
			}
			throw err;
		}
	}

	async softDelete(
		id: string,
		userId: string,
		tx?: UnitOfWorkContext,
	): Promise<void> {
		// D-TX-5 + D-TX-7 invariants: refuse to soft-delete foreign-owned
		// rows. The `createdBy: userId` filter on the `where` clause
		// implements D-TX-7 ownership; the `deletedAt: null` filter
		// implements the soft-delete idempotence (re-deleting a
		// tombstoned row is a no-op). The atomic `updateMany` eliminates
		// the race window where a concurrent update could re-mutate a
		// soft-deleted row.
		//
		// We translate "zero rows affected" to `TransactionNotFoundError`
		// (instead of a silent no-op) so the caller can distinguish a
		// successful delete from a no-op. The domain layer's
		// `service.softDelete` no-ops on the throw (the row is already
		// tombstoned — the delete is an idempotent 204 on the wire).
		const db = (tx?.tx as PrismaClient | undefined) ?? this.prisma;
		await db.transaction.updateMany({
			where: { id, createdBy: userId, deletedAt: null },
			data: {
				deletedAt: new Date(),
				updatedBy: userId,
			},
		});
	}
}

/** Translated from Prisma's `P2025` ("Record to update not found"). */
export class TransactionNotFoundError extends Error {
	constructor(public readonly id: string) {
		super(`Transaction "${id}" not found or already soft-deleted`);
		this.name = "TransactionNotFoundError";
	}
}

/**
 * Translated from Prisma's `P2002` (unique-constraint violation). Today
 * the schema has no `@@unique(...)` on Transaction; this error class is
 * a forward-looking guard for the day a unique constraint lands. The
 * `__tests__/prisma-transaction.repository.test.ts` suite asserts the
 * translation with a mocked P2002 so the contract is locked in.
 */
export class TransactionAlreadyExistsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TransactionAlreadyExistsError";
	}
}

/**
 * Recognizes Prisma's `P2034` (Postgres serialization failure on
 * `SERIALIZABLE` transactions). When the update path's `SERIALIZABLE`
 * `$transaction` is aborted by a concurrent `softDelete`, Prisma
 * surfaces the failure as `P2034`; the adapter translates it to
 * `TransactionNotFoundError` so the domain layer never sees a raw
 * Prisma error.
 *
 * Lives locally (not in `@core/database`) because the translation is
 * `Transaction`-specific — Category has its own `CategoryNotFoundError`
 * with the same pattern, but the boundary ownership stays with the
 * adapter to keep the public surface tight.
 */
function isPrismaSerializationFailure(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: unknown }).code === "P2034"
	);
}

function projectTransaction(row: {
	id: string;
	amount: PrismaDecimal;
	currencyCode: string;
	kind: string;
	reportingAmount: PrismaDecimal | null;
	reportingCurrencyCode: string | null;
	fxRateId: string | null;
	categoryId: string;
	notes: string | null;
	occurredAt: Date;
	createdBy: string;
	updatedBy: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}): Transaction {
	return {
		id: row.id,
		amount: toDecimal(row.amount.toString()),
		currencyCode: row.currencyCode,
		kind: row.kind === "income" ? "income" : "expense",
		reportingAmount:
			row.reportingAmount === null
				? null
				: toDecimal(row.reportingAmount.toString()),
		reportingCurrencyCode: row.reportingCurrencyCode,
		fxRateId: row.fxRateId,
		categoryId: row.categoryId,
		notes: row.notes,
		occurredAt: row.occurredAt,
		createdBy: row.createdBy,
		updatedBy: row.updatedBy,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt,
	};
}
