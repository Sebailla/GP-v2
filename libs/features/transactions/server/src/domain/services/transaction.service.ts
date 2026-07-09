import {
	TRANSACTIONS_CREATED,
	TRANSACTIONS_FX_STALE,
	TRANSACTIONS_SOFT_DELETED,
	TRANSACTIONS_UPDATED,
	type DomainEvent,
} from "@core/events";
import { toDecimal, type Decimal } from "@shared-utils/decimal";

import type {
	Transaction,
	TransactionKind,
} from "../entities/transaction.entity.js";
import type {
	IdempotencyKey,
	IdempotencyKeyInsert,
} from "../entities/idempotency-key.entity.js";
import type { TransactionRepository } from "../interfaces/transaction.repository.js";
import type { CategoryRepository } from "../interfaces/category.repository.js";
import { CategoryNotFoundError } from "../interfaces/category.repository.js";
import type { FxRateProvider } from "../interfaces/fx-rate.provider.js";
import type { IdempotencyRepository } from "../interfaces/idempotency.repository.js";
import type { AuditLogRepository } from "../interfaces/audit-log.repository.js";
import { DuplicateIdempotencyKeyError } from "../interfaces/idempotency.repository.js";
import { STALENESS_WINDOW_MS, IDEMPOTENCY_TTL_MS } from "../../constants.js";
import type { TransactionsEventDispatcher } from "../../events.js";
import { TransactionNotFoundError } from "../../infrastructure/repositories/prisma-transaction.repository.js";

/**
 * Canonical create-transaction input. Mirrors the Zod `createSchema`
 * (slice 5 PR #1, `libs/features/transactions/shared/schemas/create.ts`)
 * minus the `slug` field that the controller derives from the session.
 *
 * The service is the trust boundary — the controller has already
 * validated via `ZodValidationPipe`, but the service re-checks (the
 * schema is exported and the service composes the boundary).
 */
export interface CreateTransactionInput {
	readonly amount: Decimal;
	readonly currencyCode: string;
	readonly kind: TransactionKind;
	readonly categoryId: string;
	readonly notes: string | null;
	readonly occurredAt: Date;
	readonly reportingCurrencyCode: string;
	readonly reportingAmount: Decimal | null;
	readonly fxRateId: string | null;
}

/**
 * Context for service-level mutations. The `actorId` is the
 * call-site principal (HTTP request auth, CLI session); the
 * `userId` is the resource owner. They MAY differ (admin actions on
 * behalf of a user) — PR #3b wires the admin path.
 *
 * `idempotencyKey` and `requestFingerprint` are optional. When both
 * are present, the service implements D-TX-1: a replay with the
 * same `(userId, key)` and matching fingerprint returns the cached
 * response; a replay with a different fingerprint returns
 * `IdempotencyKeyReusedError` (controller maps to 409). The
 * `requestFingerprint` is the SHA-256 of the canonical request
 * payload (controller computes it; service doesn't care about the
 * algorithm).
 */
export interface TransactionServiceContext {
	readonly userId: string;
	readonly actorId: string;
	readonly idempotencyKey?: string;
	readonly requestFingerprint?: string;
}

/**
 * Domain service for `Transaction` aggregate. The orchestrator
 * (design §5.9): validate → FX lookup with staleness dispatch →
 * persist → audit log → event dispatch → idempotency-key atomic
 * create.
 *
 * Constructor injection (Pattern A, per the auth slice convention
 * from slice 3 batch 6). The clock is injected as `() => Date` so
 * tests can pin `now` for D-TX-4 staleness evaluation.
 */
export class TransactionService {
	constructor(
		private readonly txRepo: TransactionRepository,
		private readonly categoryRepo: CategoryRepository,
		private readonly fxProvider: FxRateProvider,
		private readonly idempotencyRepo: IdempotencyRepository,
		private readonly auditLogRepo: AuditLogRepository,
		private readonly events: TransactionsEventDispatcher,
		private readonly clock: () => Date = () => new Date(),
	) {}

	/**
	 * Create a new transaction. The full orchestration (design §5.9):
	 *
	 *   1. Idempotency replay (D-TX-1) — if `ctx.idempotencyKey` is set,
	 *      check the cache. Hit + matching fingerprint → return cached
	 *      payload. Hit + mismatched fingerprint → 409 (controller
	 *      surface; service throws `IdempotencyKeyReusedError`).
	 *   2. Load the active `Category` (D-TX-5 boundary). Missing or
	 *      soft-deleted → throw `CategoryNotFoundError`.
	 *   3. FX lookup (D-TX-3 + D-TX-4) — if `input.currencyCode !==
	 *      input.reportingCurrencyCode`, fetch the rate from the
	 *      provider. Same-currency pairs return null (provider contract).
	 *      Null rate → throw `UnsupportedCurrencyPairError`. Stale rate
	 *      (>24h old) → emit `transactions.fx.stale` (informational,
	 *      NOT a write blocker).
	 *   4. Persist the `Transaction` row.
	 *   5. Write the `AuditLog` row.
	 *   6. Dispatch `transactions.created`.
	 *   7. Idempotency atomic create — if the context carried an
	 *      `idempotencyKey`, persist the response via the atomic
	 *      `create` (throws `DuplicateIdempotencyKeyError` on a
	 *      concurrent first-call race; we re-`find` to read the winner's
	 *      payload and return it).
	 *   8. Return the persisted transaction.
	 *
	 * The ThresholdService runs in the controller step after
	 * `create` returns — keeping threshold evaluation out of the
	 * create path means the service is reusable for non-threshold
	 * flows (admin imports, BDD fixtures, etc.).
	 */
	async create(
		input: CreateTransactionInput,
		ctx: TransactionServiceContext,
	): Promise<Transaction> {
		// 1. Idempotency replay.
		if (ctx.idempotencyKey !== undefined) {
			if (ctx.requestFingerprint === undefined) {
				// The controller is responsible for computing the fingerprint
				// before reaching the service; the service refuses to play
				// the cache game without one. (If the controller is wired
				// without a fingerprint, that's a controller-level bug.)
				throw new Error(
					"TransactionService.create: idempotencyKey requires requestFingerprint",
				);
			}
			const replay = await this.idempotencyOrReplay(
				ctx.userId,
				ctx.idempotencyKey,
				ctx.requestFingerprint,
			);
			if (replay.kind === "replay") {
				return replay.transaction;
			}
			// Miss path — fall through to the full create.
		}

		// 2. Load the active category.
		const category = await this.categoryRepo.findById(input.categoryId);
		if (category === null) {
			throw new CategoryNotFoundError(input.categoryId);
		}

		// 3. FX lookup + staleness dispatch.
		const fx = await this.lookupFx(
			input.amount,
			input.currencyCode,
			input.reportingCurrencyCode,
		);

		// 4. Persist.
		const transaction = await this.txRepo.create({
			amount: input.amount,
			currencyCode: input.currencyCode,
			kind: input.kind,
			categoryId: input.categoryId,
			notes: input.notes,
			occurredAt: input.occurredAt,
			reportingAmount: fx.reportingAmount,
			reportingCurrencyCode: input.reportingCurrencyCode,
			fxRateId: fx.fxRateId,
			createdBy: ctx.userId,
			updatedBy: ctx.userId,
		});

		// 5. Audit log.
		await this.auditLogRepo.append({
			entityType: "Transaction",
			entityId: transaction.id,
			action: "create",
			actorId: ctx.actorId,
			payload: {
				amount: transaction.amount.toString(),
				currencyCode: transaction.currencyCode,
				kind: transaction.kind,
				categoryId: transaction.categoryId,
			},
		});

		// 6. Dispatch `transactions.created`.
		await this.events({
			name: TRANSACTIONS_CREATED,
			userId: ctx.userId,
			payload: {
				transactionId: transaction.id,
				userId: ctx.userId,
				amount: transaction.amount.toString(),
				currency: transaction.currencyCode,
			},
			occurredAt: this.clock(),
		});

		// 7. Idempotency atomic create (only if the request carried a key).
		if (
			ctx.idempotencyKey !== undefined &&
			ctx.requestFingerprint !== undefined
		) {
			await this.cacheIdempotencyResponse(
				ctx.userId,
				ctx.idempotencyKey,
				ctx.requestFingerprint,
				transaction,
			);
		}

		return transaction;
	}

	/**
	 * Internal: handle the idempotency replay branch.
	 *
	 * Returns:
	 *  - `{ kind: "replay", transaction }` if the cache has a matching
	 *    fingerprint → return the cached payload.
	 *  - `{ kind: "miss" }` otherwise (no key, or the key is fresh).
	 *
	 * Throws `IdempotencyKeyReusedError` if the cache has a DIFFERENT
	 * fingerprint — the controller maps this to `409 Conflict`.
	 */
	private async idempotencyOrReplay(
		userId: string,
		key: string,
		fingerprint: string,
	): Promise<
		| { readonly kind: "miss" }
		| { readonly kind: "replay"; readonly transaction: Transaction }
	> {
		const existing = await this.idempotencyRepo.find(userId, key);
		if (existing === null) {
			return { kind: "miss" };
		}
		if (existing.requestFingerprint !== fingerprint) {
			throw new IdempotencyKeyReusedError(userId, key);
		}
		// The cached payload was the response of the first call. The
		// service stored the projected `Transaction` JSON; reverse the
		// shape back to the domain entity.
		return {
			kind: "replay",
			transaction: this.transactionFromIdempotencyPayload(existing),
		};
	}

	/**
	 * Internal: cache the response after a successful first-call
	 * write. The atomic `create` throws `DuplicateIdempotencyKeyError`
	 * on a concurrent race; we re-`find` to read the winner's
	 * payload. Either way, the original write is preserved (the
	 * losing write's transaction is a real transaction; the cache
	 * just records the winner's response).
	 */
	private async cacheIdempotencyResponse(
		userId: string,
		key: string,
		fingerprint: string,
		transaction: Transaction,
	): Promise<void> {
		const insert: IdempotencyKeyInsert = {
			key,
			userId,
			requestFingerprint: fingerprint,
			responsePayload: this.transactionToIdempotencyPayload(transaction),
			responseStatus: 201,
			transactionId: transaction.id,
			expiresAt: new Date(this.clock().getTime() + IDEMPOTENCY_TTL_MS),
		};
		try {
			await this.idempotencyRepo.create(insert);
		} catch (err) {
			if (err instanceof DuplicateIdempotencyKeyError) {
				// Concurrent first-call won the race. The losing write's
				// transaction is real (we just persisted it). The cache
				// records the winner's response; subsequent replays with
				// the same key will hit the winner's payload via `find()`.
				// No re-throw — the original `create` succeeded from the
				// service's perspective; idempotency is a cache, not a gate.
				return;
			}
			throw err;
		}
	}

	/**
	 * Internal: FX lookup + staleness evaluation. The provider returns
	 * `null` for same-currency pairs (D-TX-3) and for unknown pairs.
	 * Same-currency short-circuits to the original amount; unknown
	 * pairs throw `UnsupportedCurrencyPairError`.
	 *
	 * The `fxRateId` on the result is the canonical rate ID we attach
	 * to the persisted transaction row (NULL for same-currency). For
	 * the in-memory provider the id is unavailable (the live rate
	 * object carries `rate` + `recordedAt` only); a future PR will
	 * wire the InMemory provider to a synthetic id when the
	 * `FxRateRepository` is consulted before this lookup.
	 */
	private async lookupFx(
		amount: Decimal,
		fromCode: string,
		toCode: string,
	): Promise<{
		readonly reportingAmount: Decimal | null;
		readonly fxRateId: string | null;
	}> {
		// D-TX-3: same-currency. The provider also returns null here;
		// we short-circuit before the dispatch path.
		if (fromCode === toCode) {
			return { reportingAmount: null, fxRateId: null };
		}
		const rate = await this.fxProvider.getRate(fromCode, toCode);
		if (rate === null) {
			throw new UnsupportedCurrencyPairError(fromCode, toCode);
		}
		// D-TX-4: stale-rate dispatch. Informational; the write
		// proceeds regardless. The event name is from
		// `@core/events/types.ts`; the payload schema is the source of
		// truth.
		const now = this.clock();
		const ageMs = now.getTime() - rate.recordedAt.getTime();
		if (ageMs > STALENESS_WINDOW_MS) {
			await this.events({
				name: TRANSACTIONS_FX_STALE,
				payload: {
					from: fromCode,
					to: toCode,
					recordedAt: rate.recordedAt,
					observedAt: now,
					ageHours: ageMs / (60 * 60 * 1000),
				},
				occurredAt: now,
			});
		}
		// Compute `reportingAmount = amount × rate`. decimal.js carries
		// the precision; the cast keeps the `toDecimal()` shape.
		const reportingAmount = amount.mul(rate.rate);
		return {
			reportingAmount,
			fxRateId: null,
		};
	}

	/**
	 * Internal: serialize the persisted `Transaction` into the
	 * idempotency cache payload. The shape is the canonical JSON
	 * projection used for the response envelope; reverse via
	 * `transactionFromIdempotencyPayload`.
	 */
	private transactionToIdempotencyPayload(
		t: Transaction,
	): Record<string, unknown> {
		return {
			id: t.id,
			amount: t.amount.toString(),
			currencyCode: t.currencyCode,
			kind: t.kind,
			reportingAmount:
				t.reportingAmount === null ? null : t.reportingAmount.toString(),
			reportingCurrencyCode: t.reportingCurrencyCode,
			fxRateId: t.fxRateId,
			categoryId: t.categoryId,
			notes: t.notes,
			occurredAt: t.occurredAt.toISOString(),
			createdBy: t.createdBy,
			updatedBy: t.updatedBy,
			createdAt: t.createdAt.toISOString(),
			updatedAt: t.updatedAt.toISOString(),
			deletedAt: t.deletedAt === null ? null : t.deletedAt.toISOString(),
		};
	}

	private transactionFromIdempotencyPayload(
		cached: IdempotencyKey,
	): Transaction {
		const p = cached.responsePayload as Record<string, unknown>;
		return {
			id: p["id"] as string,
			amount: toDecimal(p["amount"] as string),
			currencyCode: p["currencyCode"] as string,
			kind: p["kind"] as TransactionKind,
			reportingAmount:
				p["reportingAmount"] === null
					? null
					: toDecimal(p["reportingAmount"] as string),
			reportingCurrencyCode:
				(p["reportingCurrencyCode"] as string | null) ?? null,
			fxRateId: (p["fxRateId"] as string | null) ?? null,
			categoryId: p["categoryId"] as string,
			notes: (p["notes"] as string | null) ?? null,
			occurredAt: new Date(p["occurredAt"] as string),
			createdBy: p["createdBy"] as string,
			updatedBy: p["updatedBy"] as string,
			createdAt: new Date(p["createdAt"] as string),
			updatedAt: new Date(p["updatedAt"] as string),
			deletedAt:
				p["deletedAt"] === null ? null : new Date(p["deletedAt"] as string),
		};
	}

	/**
	 * Cursor-paginated list scoped to a single user. Thin delegation
	 * to the repository — the controller can call this directly because
	 * the repository already enforces user-scoping + soft-delete
	 * (D-TX-5). Returns `{ rows, cursor }`; the cursor is the opaque
	 * string the client feeds back as `cursor` on the next page
	 * (Prisma's stable cursor pattern).
	 *
	 * The slice close-out adds this method — T5.9 shipped only
	 * `create` and the close-out needs it for the controller's
	 * `GET /transactions` endpoint (design §5.3).
	 */
	async list(
		userId: string,
		filter: {
			readonly cursor?: string;
			readonly pageSize?: number;
			readonly categoryId?: string;
			readonly fromDate?: Date;
			readonly toDate?: Date;
			readonly currencyCode?: string;
		},
	): Promise<{
		readonly rows: ReadonlyArray<
			import("../entities/transaction.entity.js").TransactionListItem
		>;
		readonly cursor: string | null;
	}> {
		// Build the filter with conditional spread so the call satisfies
		// `exactOptionalPropertyTypes` (the port forbids `undefined`
		// on optional fields; omitting them via spread is the canonical
		// escape hatch).
		const repoFilter: Parameters<TransactionRepository["list"]>[0] = {
			userId,
			...(filter.cursor !== undefined ? { cursor: filter.cursor } : {}),
			...(filter.pageSize !== undefined ? { pageSize: filter.pageSize } : {}),
			...(filter.categoryId !== undefined
				? { categoryId: filter.categoryId }
				: {}),
			...(filter.fromDate !== undefined ? { fromDate: filter.fromDate } : {}),
			...(filter.toDate !== undefined ? { toDate: filter.toDate } : {}),
			...(filter.currencyCode !== undefined
				? { currencyCode: filter.currencyCode }
				: {}),
		};
		const page = await this.txRepo.list(repoFilter);
		// The repository returns `TransactionListItem[]` (a stripped-down
		// projection: no notes / createdBy / updatedBy — see entity.ts).
		// The service passes the projection through unchanged; the
		// controller serializes the items directly. Single-transaction
		// endpoints (GET/PATCH) fetch the full row via `findById` when
		// they need notes / createdBy / updatedBy.
		return { rows: page.rows, cursor: page.cursor };
	}

	/**
	 * Patch an existing transaction by id. The orchestration:
	 *
	 *   1. If `categoryId` is in the patch, verify the new category is
	 *      active (D-TX-5 boundary). Missing or soft-deleted → throw
	 *      `CategoryNotFoundError`.
	 *   2. Persist via the repository. The repository enforces both
	 *      D-TX-5 (no soft-deleted) AND D-TX-7 (only `createdBy = actorId`)
	 *      in the SAME SERIALIZABLE `$transaction`; a foreign-owned row
	 *      surfaces as `TransactionNotFoundError` (no info-leak).
	 *   3. Write the audit log (action = "update", payload includes the
	 *      changed fields).
	 *   4. Dispatch `transactions.updated` with the changed fields.
	 *
	 * The slice close-out adds this — T5.9 shipped only `create`.
	 */
	async update(
		id: string,
		input: {
			readonly amount?: import("@shared-utils/decimal").Decimal;
			readonly currencyCode?: string;
			readonly kind?: TransactionKind;
			readonly categoryId?: string;
			readonly notes?: string | null;
			readonly occurredAt?: Date;
		},
		actorId: string,
	): Promise<Transaction> {
		const changedFields = Object.keys(input).filter(
			(k) => (input as Record<string, unknown>)[k] !== undefined,
		);
		if (input.categoryId !== undefined) {
			const category = await this.categoryRepo.findById(input.categoryId);
			if (category === null) {
				throw new CategoryNotFoundError(input.categoryId);
			}
		}
		// `actorId` plays two roles: the audit-log `actorId` AND the
		// D-TX-7 ownership filter on the repository's `where` clause.
		// The adapter rejects foreign-owned rows with the same
		// `TransactionNotFoundError` as missing rows — no info-leak.
		const updated = await this.txRepo.update(id, actorId, {
			...input,
			updatedBy: actorId,
		});
		await this.auditLogRepo.append({
			entityType: "Transaction",
			entityId: updated.id,
			action: "update",
			actorId,
			payload: { changedFields, ...input },
		});
		await this.events({
			name: TRANSACTIONS_UPDATED,
			userId: updated.createdBy,
			payload: {
				transactionId: updated.id,
				userId: updated.createdBy,
				changedFields,
				at: this.clock(),
			},
			occurredAt: this.clock(),
		});
		return updated;
	}

	/**
	 * Soft-delete a transaction. The repository enforces both D-TX-5
	 * (no soft-deleted) AND D-TX-7 (only `createdBy = actorId`) in a
	 * single `updateMany`; a missing OR foreign-owned row surfaces as
	 * `TransactionNotFoundError` from the service so the controller's
	 * 404 branch is reachable.
	 *
	 * The repository's `updateMany` returns the affected-row count via
	 * `prisma.transaction.updateMany` — if zero rows match the where
	 * (missing OR foreign-owned OR already tombstoned), the service
	 * throws. The service translates the throw into `TransactionNotFoundError`
	 * only when the row was already tombstoned (idempotent 204 on the
	 * wire); foreign ownership surfaces as 404 with no info-leak.
	 *
	 * The slice close-out adds this — T5.9 shipped only `create`.
	 */
	async softDelete(id: string, actorId: string): Promise<void> {
		// Load the row INCLUDING tombstoned state so we can distinguish
		// "already tombstoned but still owned" (silent 204) from "missing
		// or foreign-owned" (404). The `findByIdForUserIncludingDeleted`
		// adapter still enforces D-TX-7 ownership (the `createdBy = userId`
		// filter rejects foreign-owned tombstoned rows); the only state
		// difference from `findByIdForUser` is the lack of the
		// `deletedAt: null` filter.
		const existing = await this.txRepo.findByIdForUserIncludingDeleted(
			id,
			actorId,
		);
		if (existing === null) {
			// Foreign-owned OR does not exist — either way the caller
			// never gets to mutate a row that isn't theirs. The controller
			// maps the error to 404 (no info-leak on "exists vs. mine").
			throw new TransactionNotFoundError(id);
		}
		if (existing.deletedAt !== null) {
			// Already tombstoned by this same user — idempotent 204 on
			// the wire, no second audit row, no second event dispatch
			// (matches the design's "soft-delete is idempotent" rule).
			return;
		}
		await this.txRepo.softDelete(id, actorId);
		await this.auditLogRepo.append({
			entityType: "Transaction",
			entityId: id,
			action: "softDelete",
			actorId,
			payload: { at: this.clock() },
		});
		await this.events({
			name: TRANSACTIONS_SOFT_DELETED,
			userId: existing.createdBy,
			payload: {
				transactionId: id,
				userId: existing.createdBy,
				at: this.clock(),
			},
			occurredAt: this.clock(),
		});
	}
}

// Domain error classes are imported from the port files
// (CategoryNotFoundError from the category port,
// IdempotencyKeyReusedError + UnsupportedCurrencyPairError stay
// local to this service since they're transaction-specific).
// PR #3a note: the local `IdempotencyKeyReusedError` is the
// semantic equivalent of a future port contract — if a second
// service needs the same shape, hoist it to the idempotency
// port and have this service import it.
//

/**
 * FX math (`amount × rate`) is computed inline in `lookupFx` via
 * `Decimal.mul()`. The `Decimal` import is retained for
 * `toDecimal()` conversions (input amounts, idempotency
 * payload serialization, etc.).
 */

// Helper export so tests can assert on the event types.
export type { DomainEvent };

/**
 * Domain error raised when an idempotency replay arrives with a
 * different fingerprint than the cached first-call. The controller
 * maps this to `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`).
 */
export class IdempotencyKeyReusedError extends Error {
	constructor(
		public readonly userId: string,
		public readonly key: string,
	) {
		super(
			`Idempotency key "${key}" was previously used with a different payload`,
		);
		this.name = "IdempotencyKeyReusedError";
	}
}

/**
 * Domain error raised when the FX provider has no rate for the
 * requested currency pair. The controller maps this to `422
 * Unprocessable Entity` (`UNSUPPORTED_CURRENCY_PAIR`).
 */
export class UnsupportedCurrencyPairError extends Error {
	constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(`No FX rate configured for ${from} → ${to}`);
		this.name = "UnsupportedCurrencyPairError";
	}
}
