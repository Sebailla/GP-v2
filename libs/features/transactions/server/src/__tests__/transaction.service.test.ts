import { describe, it, expect, vi, beforeEach } from "vitest";

import { toDecimal, type Decimal } from "@shared-utils/decimal";

import type { Transaction } from "../domain/entities/transaction.entity.js";
import type { Category } from "../domain/entities/category.entity.js";
import type { IdempotencyKey } from "../domain/entities/idempotency-key.entity.js";
import type { TransactionRepository } from "../domain/interfaces/transaction.repository.js";
import type { CategoryRepository } from "../domain/interfaces/category.repository.js";
import { CategoryNotFoundError } from "../domain/interfaces/category.repository.js";
import type { FxRateProvider } from "../domain/interfaces/fx-rate.provider.js";
import type { IdempotencyRepository } from "../domain/interfaces/idempotency.repository.js";
import { DuplicateIdempotencyKeyError } from "../domain/interfaces/idempotency.repository.js";
import type { AuditLogRepository } from "../domain/interfaces/audit-log.repository.js";
import {
  TransactionService,
  IdempotencyKeyReusedError,
  UnsupportedCurrencyPairError,
  type CreateTransactionInput,
} from "../domain/services/transaction.service.js";
import type { UnitOfWork } from "../domain/interfaces/unit-of-work.js";
import { TRANSACTIONS_CREATED, TRANSACTIONS_FX_STALE } from "@core/events";

/**
 * TDD contract for `TransactionService.create` (slice 5 PR #3a — T5.9).
 *
 * The service is the orchestrator. We mock every port and assert on
 * the call shape + order, plus the event dispatcher + audit log.
 *
 * Service-level tests (not integration): the InMemory FX provider +
 * the Prisma adapters are out of scope here. The triangulate suite
 * (T5.12) wires the real adapters for end-to-end coverage.
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
    reportingAmount: toDecimal("12340.0014"),
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

function makeService(
  opts: {
    /** Override the `now` for the service's clock (used for FX staleness). */
    now?: Date;
    /** Pre-mocked category returned by `findById` (default: `fakeCategory()`). */
    category?: Category | null;
    /** Pre-mocked transaction returned by `create` (default: `fakeTransaction()`). */
    transaction?: Transaction;
    /** Pre-mocked FX rate (`{ rate, recordedAt }`); omit to make `getRate` return null. */
    fxRate?: { rate: Decimal; recordedAt: Date } | null;
    /** Pre-mocked idempotency `find` result. */
    idempotencyFind?: IdempotencyKey | null;
    /** When true, `idempotency.create` throws `DuplicateIdempotencyKeyError`. */
    idempotencyCreateRaces?: boolean;
  } = {},
) {
  const findById = vi
    .fn()
    .mockResolvedValue(opts.category === null ? null : (opts.category ?? fakeCategory()));
  const txCreate = vi.fn().mockResolvedValue(opts.transaction ?? fakeTransaction());
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
  const create = opts.idempotencyCreateRaces
    ? vi.fn().mockRejectedValue(new DuplicateIdempotencyKeyError("user-1", "key-1"))
    : vi.fn().mockResolvedValue(undefined);
  const append = vi.fn().mockResolvedValue(undefined);
  const events = vi.fn().mockResolvedValue(undefined);
  const now = opts.now ?? new Date("2026-06-01T12:00:00.000Z");
  const clock = () => now;

  const txRepo: TransactionRepository = {
    findByIdForUser: vi.fn().mockResolvedValue(opts.transaction ?? fakeTransaction()),
    findByIdForUserIncludingDeleted: vi
      .fn()
      .mockResolvedValue(opts.transaction ?? fakeTransaction()),
    list: vi.fn().mockResolvedValue({ rows: [], total: 0, cursor: null }),
    create: txCreate,
    update: vi.fn().mockResolvedValue(opts.transaction ?? fakeTransaction()),
    softDelete: vi.fn().mockResolvedValue(undefined),
    findManyForUser: vi.fn().mockResolvedValue([]),
  };
  const categoryRepo: CategoryRepository = {
    findById,
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(fakeCategory()),
    update: vi.fn().mockResolvedValue(fakeCategory()),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
  const fxProvider: FxRateProvider = { getRate };
  const idempotencyRepo: IdempotencyRepository = { find, create, purgeExpired: vi.fn() };
  const auditLogRepo: AuditLogRepository = { append, findByEntity: vi.fn(), listByActor: vi.fn() };

  // Test-only UnitOfWork: invokes the callback synchronously with
  // a benign `{ tx: undefined }` context. Repositories that branch on
  // `tx?.tx` and fall back to their default `this.prisma` see the
  // same null context as a non-unit-of-work call.
  const unitOfWork: UnitOfWork = {
    run: <T>(fn: (ctx: { tx: unknown }) => Promise<T>) => fn({ tx: undefined }),
  };

  const service = new TransactionService(
    txRepo,
    categoryRepo,
    fxProvider,
    idempotencyRepo,
    auditLogRepo,
    events,
    unitOfWork,
    clock,
  );

  return {
    service,
    txCreate,
    findById,
    getRate,
    find,
    create,
    append,
    events,
    now,
  };
}

function baseInput(overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput {
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

describe("TransactionService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("happy path", () => {
    it("loads the active category, fetches FX, persists, audits, dispatches", async () => {
      const { service, findById, getRate, txCreate, append, events } = makeService();
      const txn = await service.create(baseInput(), baseCtx);

      expect(findById).toHaveBeenCalledWith("cat-1");
      expect(getRate).toHaveBeenCalledWith("USD", "ARS");
      expect(txCreate).toHaveBeenCalledTimes(1);
      // The amount × rate multiplication: 12.34 × 1000.001 = 12340.01234.
      // decimal.js handles the precision.
      const callArg = (
        vi.mocked(txCreate).mock.calls[0] as unknown as [
          { amount: Decimal; reportingAmount: Decimal | null },
        ]
      )[0];
      expect(callArg.amount.toString()).toBe("12.34");
      expect(callArg.reportingAmount?.toString()).toBe("12340.01234");
      expect(append).toHaveBeenCalledTimes(1);
      expect(events).toHaveBeenCalledTimes(1);
      const event = (
        vi.mocked(events).mock.calls[0] as unknown as [
          { name: string; payload: Record<string, unknown> },
        ]
      )[0];
      expect(event.name).toBe(TRANSACTIONS_CREATED);
      expect(txn.id).toBe("txn-1");
    });

    it("emits `transactions.fx.stale` when the rate is older than 24h (D-TX-4)", async () => {
      // Clock = 2026-06-02 (24h+1d after the rate's recordedAt 2026-06-01).
      const oldRate = {
        rate: toDecimal("1000.001"),
        recordedAt: new Date("2026-05-31T00:00:00.000Z"),
      };
      const { service, events } = makeService({
        now: new Date("2026-06-02T12:00:00.000Z"),
        fxRate: oldRate,
      });

      await service.create(baseInput(), baseCtx);

      // First event is the stale-rate dispatch; second is `transactions.created`.
      expect(events).toHaveBeenCalledTimes(2);
      const staleEvent = (
        vi.mocked(events).mock.calls[0] as unknown as [
          { name: string; payload: { ageHours: number } },
        ]
      )[0];
      expect(staleEvent.name).toBe(TRANSACTIONS_FX_STALE);
      expect(staleEvent.payload.ageHours).toBeGreaterThan(24);
    });

    it("skips FX when from === to (D-TX-3 same-currency short-circuit)", async () => {
      const { service, getRate, txCreate } = makeService();
      const input = baseInput({
        currencyCode: "USD",
        reportingCurrencyCode: "USD",
      });
      await service.create(input, baseCtx);

      // Provider is NOT consulted on the same-currency path.
      expect(getRate).not.toHaveBeenCalled();
      // The transaction is persisted with `reportingAmount: null` (no
      // FX conversion applied; reporting amount equals input amount by
      // definition in the same-currency case).
      const callArg = (
        vi.mocked(txCreate).mock.calls[0] as unknown as [
          { reportingAmount: Decimal | null; fxRateId: string | null },
        ]
      )[0];
      expect(callArg.reportingAmount).toBeNull();
      expect(callArg.fxRateId).toBeNull();
    });
  });

  describe("error paths", () => {
    it("throws CategoryNotFoundError when the category is missing or soft-deleted (D-TX-5)", async () => {
      const { service, getRate, txCreate } = makeService({ category: null });

      await expect(service.create(baseInput(), baseCtx)).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );
      // No FX, no persist, no audit, no event.
      expect(getRate).not.toHaveBeenCalled();
      expect(txCreate).not.toHaveBeenCalled();
    });

    it("throws UnsupportedCurrencyPairError when the provider has no rate", async () => {
      const { service, txCreate } = makeService({ fxRate: null });

      await expect(service.create(baseInput(), baseCtx)).rejects.toBeInstanceOf(
        UnsupportedCurrencyPairError,
      );
      expect(txCreate).not.toHaveBeenCalled();
    });
  });

  describe("idempotency replay (D-TX-1)", () => {
    it("returns the cached payload when the cache hits with a matching fingerprint", async () => {
      const cached: IdempotencyKey = {
        id: "ik-1",
        key: "key-1",
        userId: "user-1",
        requestFingerprint: "fp-1",
        responsePayload: {
          id: "txn-cached",
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
        transactionId: "txn-cached",
        expiresAt: new Date("2026-06-02T12:00:00.000Z"),
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
      };
      const { service, txCreate, findById, getRate, events } = makeService({
        idempotencyFind: cached,
      });

      const result = await service.create(baseInput(), {
        ...baseCtx,
        idempotencyKey: "key-1",
        requestFingerprint: "fp-1",
      });

      // The replay path does NOT touch category / FX / persist / audit.
      expect(result.id).toBe("txn-cached");
      expect(txCreate).not.toHaveBeenCalled();
      expect(findById).not.toHaveBeenCalled();
      expect(getRate).not.toHaveBeenCalled();
      expect(events).not.toHaveBeenCalled();
    });

    it("throws IdempotencyKeyReusedError on fingerprint mismatch (controller maps to 409)", async () => {
      const cached: IdempotencyKey = {
        id: "ik-1",
        key: "key-1",
        userId: "user-1",
        requestFingerprint: "fp-original",
        responsePayload: { id: "txn-1" },
        responseStatus: 201,
        transactionId: "txn-1",
        expiresAt: new Date("2026-06-02T12:00:00.000Z"),
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
      };
      const { service, txCreate } = makeService({ idempotencyFind: cached });

      await expect(
        service.create(baseInput(), {
          ...baseCtx,
          idempotencyKey: "key-1",
          requestFingerprint: "fp-different",
        }),
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      expect(txCreate).not.toHaveBeenCalled();
    });

    it("caches the response after a successful first-call write (atomic create, no P2002)", async () => {
      const { service, create, find } = makeService();
      await service.create(baseInput(), {
        ...baseCtx,
        idempotencyKey: "key-1",
        requestFingerprint: "fp-1",
      });

      // The cache is written exactly once with the projected
      // transaction as the response payload.
      expect(create).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(create).mock.calls[0] as unknown as [
          {
            key: string;
            userId: string;
            requestFingerprint: string;
            responsePayload: Record<string, unknown>;
            responseStatus: number;
            transactionId: string;
            expiresAt: Date;
          },
        ]
      )[0];
      expect(callArg.key).toBe("key-1");
      expect(callArg.userId).toBe("user-1");
      expect(callArg.requestFingerprint).toBe("fp-1");
      expect(callArg.responseStatus).toBe(201);
      expect(callArg.transactionId).toBe("txn-1");
      expect(callArg.expiresAt).toBeInstanceOf(Date);
      // No second `find` after the create — the first find returned
      // null (cache miss) and we went straight to the full create +
      // cache write path.
      expect(find).toHaveBeenCalledTimes(1);
    });

    it("swallows `DuplicateIdempotencyKeyError` on a concurrent first-call race (cache writes are best-effort)", async () => {
      // Concurrent first-call won the race; the cache write loses.
      // The original transaction write is preserved (we just
      // persisted it). The service returns the persisted transaction
      // and silently lets the cache stay stale — replays with the
      // same key will hit the winner's payload via `find()`.
      const { service, txCreate } = makeService({
        idempotencyCreateRaces: true,
      });

      const result = await service.create(baseInput(), {
        ...baseCtx,
        idempotencyKey: "key-1",
        requestFingerprint: "fp-1",
      });

      // The transaction write succeeded.
      expect(txCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("txn-1");
    });
  });
});
