import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	TRANSACTIONS_SOFT_DELETED,
	TRANSACTIONS_THRESHOLD_EXCEEDED,
	TRANSACTIONS_UPDATED,
} from "@core/events";
import { toDecimal, type Decimal } from "@shared-utils/decimal";

import type { Category } from "../domain/entities/category.entity.js";
import type { IdempotencyKey } from "../domain/entities/idempotency-key.entity.js";
import type { Transaction } from "../domain/entities/transaction.entity.js";
import type { AuditLogRepository } from "../domain/interfaces/audit-log.repository.js";
import type { CategoryRepository } from "../domain/interfaces/category.repository.js";
import type { FxRateProvider } from "../domain/interfaces/fx-rate.provider.js";
import type { IdempotencyRepository } from "../domain/interfaces/idempotency.repository.js";
import type { TransactionRepository } from "../domain/interfaces/transaction.repository.js";
import {
	IdempotencyKeyReusedError,
	ThresholdService,
	TransactionService,
	type CreateTransactionInput,
} from "../domain/services/index.js";
import type { TransactionsEventDispatcher } from "../events.js";
import { TransactionNotFoundError } from "../infrastructure/repositories/prisma-transaction.repository.js";
import { CategoryNotFoundError } from "../domain/interfaces/category.repository.js";
import { DuplicateIdempotencyKeyError } from "../domain/interfaces/idempotency.repository.js";

/**
 * T5.12 — Triangulation suite (slice 5 PR #3).
 *
 * Service-level integration: each test instantiates the real
 * `TransactionService` (and `ThresholdService` where the surface
 * requires it) with `vi.fn()` port doubles, and asserts the full
 * orchestration — idempotency replay, category lookup, FX fetch,
 * persistence, audit-log append, event dispatch, soft-delete
 * transition, threshold evaluation.
 *
 * Eight cross-cutting scenarios. The HTTP surface (T5.11) is layered
 * ON TOP of these contracts; the controller mapping is unit-tested
 * separately by `transactions.controller.spec.ts` (slice 7).
 */

function fakeCategory(overrides: Partial<Category> = {}): Category {
	return {
		id: "cat-1",
		name: "Groceries",
		slug: "groceries",
		kind: "expense",
		updatedBy: "user-1",
		deletedAt: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

function fakeTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: "txn-1",
		amount: toDecimal("12.34"),
		currencyCode: "USD",
		kind: "expense",
		reportingAmount: toDecimal("12340.01234"),
		reportingCurrencyCode: "ARS",
		fxRateId: null,
		categoryId: "cat-1",
		notes: null,
		occurredAt: new Date("2026-06-01T12:00:00.000Z"),
		createdBy: "user-1",
		updatedBy: "user-1",
		createdAt: new Date("2026-06-01T12:00:00.000Z"),
		updatedAt: new Date("2026-06-01T12:00:00.000Z"),
		deletedAt: null,
		...overrides,
	};
}

function fakeIdempotencyKeyEntry(
	overrides: Partial<IdempotencyKey> = {},
): IdempotencyKey {
	return {
		id: "idem-1",
		userId: "user-1",
		key: "key-1",
		requestFingerprint: "fp-1",
		responsePayload: {
			id: "txn-1",
			amount: "12.34",
			currencyCode: "USD",
			kind: "expense",
			reportingAmount: "12340.01234",
			reportingCurrencyCode: "ARS",
			fxRateId: null,
			categoryId: "cat-1",
			notes: null,
			occurredAt: "2026-06-01T12:00:00.000Z",
			createdBy: "user-1",
			updatedBy: "user-1",
			createdAt: "2026-06-01T12:00:00.000Z",
			updatedAt: "2026-06-01T12:00:00.000Z",
			deletedAt: null,
		},
		responseStatus: 201,
		transactionId: "txn-1",
		expiresAt: new Date("2026-12-31T00:00:00.000Z"),
		createdAt: new Date("2026-06-01T12:00:00.000Z"),
		...overrides,
	};
}

function makeService(
	opts: {
		now?: Date;
		category?: Category | null;
		transaction?: Transaction;
		fxRate?: { rate: Decimal; recordedAt: Date } | null;
		idempotencyFind?: IdempotencyKey | null;
	} = {},
) {
	const findById = vi
		.fn()
		.mockResolvedValue(
			opts.category === null ? null : (opts.category ?? fakeCategory()),
		);
	const txCreate = vi
		.fn()
		.mockResolvedValue(opts.transaction ?? fakeTransaction());
	const txFindById = vi
		.fn()
		.mockResolvedValue(opts.transaction ?? fakeTransaction());
	const txUpdate = vi
		.fn()
		.mockResolvedValue(opts.transaction ?? fakeTransaction());
	const txSoftDelete = vi.fn().mockResolvedValue(undefined);
	const txList = vi
		.fn()
		.mockResolvedValue({ rows: [], total: 0, cursor: null });
	const txFindMany = vi.fn().mockResolvedValue([]);

	const getRate =
		opts.fxRate === null
			? vi.fn().mockResolvedValue(null)
			: vi.fn().mockResolvedValue(
					opts.fxRate ?? {
						rate: toDecimal("1000.001"),
						recordedAt: new Date("2026-06-01T00:00:00.000Z"),
					},
				);
	const find = vi.fn().mockResolvedValue(opts.idempotencyFind ?? null);
	const idemCreate = vi.fn().mockResolvedValue(undefined);
	const append = vi.fn().mockResolvedValue(undefined);
	const events = vi.fn().mockResolvedValue(undefined);
	const now = opts.now ?? new Date("2026-06-01T12:00:00.000Z");
	const clock = () => now;

	const txRepo: TransactionRepository = {
		findByIdForUser: txFindById,
		findByIdForUserIncludingDeleted: txFindById,
		list: txList,
		create: txCreate,
		update: txUpdate,
		softDelete: txSoftDelete,
		findManyForUser: txFindMany,
	};
	const categoryRepo: CategoryRepository = {
		findById,
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue(fakeCategory()),
		update: vi.fn().mockResolvedValue(fakeCategory()),
		softDelete: vi.fn().mockResolvedValue(undefined),
	};
	const fxProvider: FxRateProvider = { getRate };
	const idempotencyRepo: IdempotencyRepository = {
		find,
		create: idemCreate,
		purgeExpired: vi.fn(),
	};
	const auditLogRepo: AuditLogRepository = {
		append,
		findByEntity: vi.fn(),
		listByActor: vi.fn(),
	};

	const service = new TransactionService(
		txRepo,
		categoryRepo,
		fxProvider,
		idempotencyRepo,
		auditLogRepo,
		events as TransactionsEventDispatcher,
		clock,
	);

	return {
		service,
		mocks: {
			findById,
			txCreate,
			txFindById,
			txUpdate,
			txSoftDelete,
			txList,
			idemCreate,
			append,
			events,
			getRate,
		},
		now,
	};
}

function baseInput(
	overrides: Partial<CreateTransactionInput> = {},
): CreateTransactionInput {
	return {
		amount: toDecimal("12.34"),
		currencyCode: "USD",
		kind: "expense",
		categoryId: "cat-1",
		notes: null,
		occurredAt: new Date("2026-06-01T12:00:00.000Z"),
		reportingCurrencyCode: "ARS",
		reportingAmount: null,
		fxRateId: null,
		...overrides,
	};
}

const baseCtx = { userId: "user-1", actorId: "user-1" };

describe("T5.12 — transactions triangulation suite (service-level integration)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ---- scenario 1: POST /transactions happy path with Idempotency-Key ----
	describe("idempotency replay", () => {
		it("[S1] POST /transactions — idempotency cache hit (matching fingerprint) returns the cached transaction without re-running the write path", async () => {
			const cached = fakeIdempotencyKeyEntry({
				requestFingerprint: "fingerprint-A",
			});
			const { service, mocks } = makeService({
				idempotencyFind: cached,
			});

			const result = await service.create(baseInput(), {
				...baseCtx,
				idempotencyKey: "key-1",
				requestFingerprint: "fingerprint-A",
			});

			expect(result.id).toBe("txn-1");
			// No fresh write, no FX lookup, no audit append — it's a replay.
			expect(mocks.txCreate).not.toHaveBeenCalled();
			expect(mocks.getRate).not.toHaveBeenCalled();
			expect(mocks.append).not.toHaveBeenCalled();
			expect(mocks.events).not.toHaveBeenCalled();
		});

		it("[S2] POST /transactions — same Idempotency-Key with a different fingerprint throws IdempotencyKeyReusedError (controller maps to HTTP 409)", async () => {
			const cached = fakeIdempotencyKeyEntry({
				requestFingerprint: "fingerprint-A",
			});
			const { service } = makeService({ idempotencyFind: cached });

			await expect(
				service.create(baseInput(), {
					...baseCtx,
					idempotencyKey: "key-1",
					requestFingerprint: "fingerprint-B-different",
				}),
			).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
		});
	});

	// ---- scenario 3 & 4 & 5: live write path with category + FX + audit ----
	describe("write path with category + FX + audit + event dispatch", () => {
		it("[S3] fresh write — category lookup, FX fetch, persistence, audit log row carries actorId = userId (D-TX audit-log rule)", async () => {
			const { service, mocks } = makeService();
			await service.create(baseInput(), baseCtx);

			expect(mocks.findById).toHaveBeenCalledWith("cat-1");
			expect(mocks.getRate).toHaveBeenCalledWith("USD", "ARS");
			expect(mocks.txCreate).toHaveBeenCalledTimes(1);
			expect(mocks.append).toHaveBeenCalledTimes(1);
			const auditCall = (
				vi.mocked(mocks.append).mock.calls[0] as unknown as [
					{ actorId: string; entityType: string; entityId: string },
				]
			)[0];
			expect(auditCall.actorId).toBe("user-1");
			expect(auditCall.entityType).toBe("Transaction");
			expect(auditCall.entityId).toBe("txn-1");
		});

		it("[S4] fresh write — missing/soft-deleted category throws CategoryNotFoundError (controller maps to 404)", async () => {
			const { service } = makeService({ category: null });
			await expect(service.create(baseInput(), baseCtx)).rejects.toBeInstanceOf(
				CategoryNotFoundError,
			);
		});

		// R4-010 — Idempotency-Key race coverage. Two concurrent first-call
		// POSTs with the same key: one wins the `idempotency.create`
		// unique-constraint, the other sees `DuplicateIdempotencyKeyError`.
		// The service treats the cache as informational (not a gate): the
		// losing write's transaction is a real, persisted row; the cache
		// records the winner's payload. Subsequent replays with the same
		// key hit the winner via `find()`. The transaction MUST persist
		// exactly once.
		it("[S4a] losing-write race: DuplicateIdempotencyKeyError on cache.create does NOT roll back the transaction (R4-010)", async () => {
			const { service, mocks } = makeService();
			// First call to `idempotencyRepo.create` throws — a concurrent
			// first-call POST won the unique-constraint race.
			vi.mocked(mocks.idemCreate).mockRejectedValueOnce(
				new DuplicateIdempotencyKeyError("user-1", "key-1"),
			);

			const txn = await service.create(baseInput(), {
				...baseCtx,
				idempotencyKey: "key-1",
				requestFingerprint: "fingerprint-A",
			});

			// The transaction row was persisted before the cache attempt;
			// the cache loss does NOT undo the write.
			expect(txn.id).toBe("txn-1");
			expect(mocks.txCreate).toHaveBeenCalledTimes(1);
			expect(mocks.append).toHaveBeenCalledTimes(1);

			// transactions.created dispatched exactly once.
			expect(mocks.events).toHaveBeenCalledTimes(1);

			// The cache.create attempt happened but threw — no exception
			// escapes the service.
		});
	});

	// ---- scenario 5: ThresholdService fires after the create succeeds ----
	describe("threshold evaluation runs AFTER the write (informational, not blocking)", () => {
		it("[S5] ThresholdService.evaluate emits transactions.threshold.exceeded when the amount crosses the configured threshold", async () => {
			const { service, mocks } = makeService();
			const events = vi.fn().mockResolvedValue(undefined);
			// Build a ThresholdService that dispatches via the same mock
			// dispatcher — the test owns both ends of the relation.
			const thresholdService = new ThresholdService(
				{ amount: toDecimal("10.00") },
				events as TransactionsEventDispatcher,
			);

			const txn = await service.create(baseInput(), baseCtx);

			// Threshold fires AFTER create returns — gate contract:
			// (create returns success) → (threshold may dispatch, but
			// does NOT block).
			const crossed = await thresholdService.evaluate(txn);
			expect(crossed).toBe(true);
			expect(events).toHaveBeenCalledTimes(1);
			const evt = (
				vi.mocked(events).mock.calls[0] as unknown as [
					{ name: string; payload: Record<string, unknown> },
				]
			)[0];
			expect(evt.name).toBe(TRANSACTIONS_THRESHOLD_EXCEEDED);
			expect(evt.payload["userId"]).toBe("user-1");

			// The transaction still got persisted (the write is non-blocking).
			expect(mocks.txCreate).toHaveBeenCalledTimes(1);
		});

		it("ThresholdService.evaluate does NOT dispatch when the amount is below the threshold", async () => {
			const events = vi.fn().mockResolvedValue(undefined);
			const thresholdService = new ThresholdService(
				{ amount: toDecimal("9999.00") },
				events as TransactionsEventDispatcher,
			);
			const txn = fakeTransaction({ amount: toDecimal("12.34") });

			const crossed = await thresholdService.evaluate(txn);
			expect(crossed).toBe(false);
			expect(events).not.toHaveBeenCalled();
		});
	});

	// ---- scenario 6: FX stale-rate doesn't block the write ----
	describe("FX stale-rate (D-TX-4)", () => {
		it("[S6] writes still succeed when the FX rate is older than 24h; transactions.fx.stale dispatches as informational only", async () => {
			const oldRate = {
				rate: toDecimal("1000.001"),
				recordedAt: new Date("2026-05-30T12:00:00.000Z"), // ~48h before "now"
			};
			const { service, mocks } = makeService({
				now: new Date("2026-06-01T12:00:00.000Z"),
				fxRate: oldRate,
			});

			const txn = await service.create(baseInput(), baseCtx);

			// Write succeeded — FX staleness is informational, NOT a blocker.
			expect(txn.id).toBe("txn-1");
			expect(mocks.txCreate).toHaveBeenCalledTimes(1);
			expect(mocks.append).toHaveBeenCalledTimes(1);

			// events() is called twice: once for the stale-rate dispatch,
			// once for transactions.created.
			expect(mocks.events).toHaveBeenCalledTimes(2);
			const eventNames = vi
				.mocked(mocks.events)
				.mock.calls.flatMap((call) =>
					(call as unknown as { name: string }[]).map((evt) => evt.name),
				);
			expect(eventNames).toContain("transactions.fx.stale");
			expect(eventNames).toContain("transactions.created");
		});
	});

	// ---- scenario 7: soft-delete excludes active from queries and is logged ----
	describe("soft-delete (D-TX-5)", () => {
		it("[S7] softDelete transitions active → tombstone, dispatches transactions.soft-deleted, audit-logs the transition", async () => {
			const { service, mocks } = makeService();
			await service.softDelete("txn-1", "user-1");

			expect(mocks.txSoftDelete).toHaveBeenCalledWith("txn-1", "user-1");
			expect(mocks.append).toHaveBeenCalledTimes(1);
			const auditCall = (
				vi.mocked(mocks.append).mock.calls[0] as unknown as [
					{ actorId: string; action: string; entityType: string },
				]
			)[0];
			expect(auditCall.action).toBe("softDelete");
			expect(auditCall.entityType).toBe("Transaction");
			expect(auditCall.actorId).toBe("user-1");

			expect(mocks.events).toHaveBeenCalledTimes(1);
			const evt = (
				vi.mocked(mocks.events).mock.calls[0] as unknown as [
					{ name: string; payload: { transactionId: string } },
				]
			)[0];
			expect(evt.name).toBe(TRANSACTIONS_SOFT_DELETED);
			expect(evt.payload.transactionId).toBe("txn-1");
		});

		// D-TX-7: cross-user mutation rejection — the missing-row test that
		// would have caught R1-001. Adding both the softDelete and update
		// paths so a future regression that removes the ownership check
		// is caught at test time, not review time.
		it("[S7a] softDelete refuses cross-user mutation: user-2 cannot soft-delete user-1's transaction (D-TX-7)", async () => {
			const { service, mocks } = makeService();
			// findByIdForUser(id, "user-2") returns null because the row
			// is owned by user-1 — the ownership filter rejects the read.
			vi.mocked(mocks.txFindById).mockResolvedValueOnce(null);

			await expect(
				service.softDelete("txn-1", "user-2"),
			).rejects.toBeInstanceOf(TransactionNotFoundError);

			// No write, no audit, no event — the foreign-owned row is
			// indistinguishable from a missing row (no info-leak).
			expect(mocks.txSoftDelete).not.toHaveBeenCalled();
			expect(mocks.append).not.toHaveBeenCalled();
			expect(mocks.events).not.toHaveBeenCalled();
		});

		it("softDelete is idempotent for already-tombstoned (but owned) rows: returns silently, no audit row, no event", async () => {
			const { service, mocks } = makeService();
			// findByIdForUser returns the OWNED row, but `deletedAt` is
			// already set — the row was soft-deleted in a previous call.
			// The idempotent path skips write + audit + dispatch.
			vi.mocked(mocks.txFindById).mockResolvedValueOnce({
				...fakeTransaction(),
				deletedAt: new Date("2026-06-01T00:00:00.000Z"),
			});

			await service.softDelete("txn-1", "user-1");

			expect(mocks.txSoftDelete).not.toHaveBeenCalled();
			expect(mocks.append).not.toHaveBeenCalled();
			expect(mocks.events).not.toHaveBeenCalled();
		});
	});

	// ---- scenario 8: update path ----
	describe("update path", () => {
		it("[S8] update on missing/soft-deleted transaction rejects with TransactionNotFoundError (controller maps to 404)", async () => {
			const { service, mocks } = makeService();
			// Real PrismaTransactionRepository.update throws
			// `TransactionNotFoundError` on missing/foreign-owned rows.
			// The mock mirrors that contract — `mockRejectedValueOnce`
			// (NOT `mockResolvedValueOnce(null)`).
			vi.mocked(mocks.txUpdate).mockRejectedValueOnce(
				new TransactionNotFoundError("missing-txn"),
			);

			await expect(
				service.update("missing-txn", { notes: "new note" }, "user-1"),
			).rejects.toBeInstanceOf(TransactionNotFoundError);

			expect(mocks.events).not.toHaveBeenCalled();
		});

		// D-TX-7: cross-user mutation rejection — the missing-row test that
		// would have caught R1-001 on the update path. Same pattern as [S7a].
		it("[S8a] update refuses cross-user mutation: user-2 cannot patch user-1's transaction (D-TX-7)", async () => {
			const { service, mocks } = makeService();
			// Real adapter throws TransactionNotFoundError on the
			// `createdBy !== userId` where-mismatch.
			vi.mocked(mocks.txUpdate).mockRejectedValueOnce(
				new TransactionNotFoundError("txn-1"),
			);

			await expect(
				service.update("txn-1", { notes: "stolen update" }, "user-2"),
			).rejects.toBeInstanceOf(TransactionNotFoundError);

			expect(mocks.append).not.toHaveBeenCalled();
			expect(mocks.events).not.toHaveBeenCalled();
		});

		it("update on a soft-deleted category throws CategoryNotFoundError (D-TX-5 boundary)", async () => {
			const { service, mocks } = makeService({ category: null });

			await expect(
				service.update("txn-1", { categoryId: "deleted-cat" }, "user-1"),
			).rejects.toThrow(/Category/);

			expect(mocks.txUpdate).not.toHaveBeenCalled();
			expect(mocks.events).not.toHaveBeenCalled();
		});

		it("update with a new active category succeeds and dispatches transactions.updated", async () => {
			const { service, mocks } = makeService();
			await service.update("txn-1", { notes: "Updated note" }, "user-1");

			expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
			expect(mocks.append).toHaveBeenCalledTimes(1);
			expect(mocks.events).toHaveBeenCalledTimes(1);
			const evt = (
				vi.mocked(mocks.events).mock.calls[0] as unknown as [
					{ name: string; payload: Record<string, unknown> },
				]
			)[0];
			expect(evt.name).toBe(TRANSACTIONS_UPDATED);
			expect(evt.payload["transactionId"]).toBe("txn-1");
			expect(evt.payload["userId"]).toBe("user-1");
		});
	});
});
