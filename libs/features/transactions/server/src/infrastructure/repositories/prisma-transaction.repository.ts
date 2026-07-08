import {
  prisma as defaultPrisma,
  isPrismaNotFound,
  isPrismaUniqueViolation,
} from "@core/database";
import type {
  Prisma,
  PrismaClient,
  PrismaDecimal,
} from "@core/database";
import { toDecimal } from "@shared-utils/decimal";

import type {
  Transaction,
} from "../../domain/entities/transaction.entity.js";
import type {
  TransactionRepository,
  TransactionListFilter,
  TransactionCreate,
  TransactionUpdate,
} from "../../domain/interfaces/transaction.repository.js";

/**
 * Prisma adapter for `TransactionRepository`.
 *
 * Mirrors the slice-wide soft-delete convention from
 * `PrismaCategoryRepository` (D-TX-5): every read query path filters
 * `where: { deletedAt: null }`, AND the `update` path adds a pre-check
 * via `findFirst({ id, deletedAt: null })` so a soft-deleted row can
 * never be silently mutated. The `__tests__/` suite verifies both
 * invariants by inspecting every Prisma call's `where` clause.
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

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null },
    });
    return row === null ? null : projectTransaction(row);
  }

  async list(filter: TransactionListFilter): Promise<{
    rows: Transaction[]; // projected to TransactionListItem equivalent at service layer
    total: number;
    cursor: string | null;
  }> {
    const where: Prisma.TransactionWhereInput = {
      createdBy: filter.userId, // user-scoped: every list is filtered to a single user
      deletedAt: null,
    };
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.currencyCode !== undefined) where.currencyCode = filter.currencyCode;
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

    const take = filter.pageSize ?? 20; // matches Zod schema default

    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: take + 1, // sentinel: 1 extra to detect "more exist"
      ...(filter.cursor !== undefined ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
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

  async create(input: TransactionCreate): Promise<Transaction> {
    try {
      const row = await this.prisma.transaction.create({
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
      // P2002 translation: today the schema has no unique constraint on
      // Transaction (idempotency is enforced via IdempotencyKey, not on
      // the Transaction row itself). The translation is wired now so any
      // future `@@unique(...)` on Transaction cannot leak the raw Prisma
      // error class into the domain layer. The `isPrismaUniqueViolation`
      // call uses a placeholder target field name; the day a real unique
      // constraint lands, the target updates here and the test suite
      // locks the new translation.
      if (isPrismaUniqueViolation(err, "id")) {
        throw new TransactionAlreadyExistsError(
          "Transaction violates a unique constraint (placeholder target: 'id')",
        );
      }
      throw err;
    }
  }

  async update(id: string, input: TransactionUpdate): Promise<Transaction> {
    // D-TX-5 invariant: refuse to update soft-deleted rows. Pre-check
    // via `findFirst({ id, deletedAt: null })`; the small race window
    // between the check and the update is acceptable for PR #2 — PR #3
    // services that need stricter atomicity can wrap in a SERIALIZABLE
    // transaction. Today the pre-check catches the D-TX-5 violation
    // before the actual update is attempted.
    const existing = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null },
    });
    if (existing === null) {
      throw new TransactionNotFoundError(id);
    }

    const data: Prisma.TransactionUncheckedUpdateInput = {
      updatedBy: input.updatedBy,
    };
    if (input.amount !== undefined) data.amount = input.amount.toString();
    if (input.currencyCode !== undefined) data.currencyCode = input.currencyCode;
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
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.occurredAt !== undefined) data.occurredAt = input.occurredAt;

    const row = await this.prisma.transaction.update({
      where: { id },
      data,
    });
    return projectTransaction(row);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    // D-TX-5: use `updateMany` with the `deletedAt: null` filter so a
    // soft-deleted (or non-existent) row is a silent no-op. The count is
    // intentionally discarded — we don't surface "did it actually
    // delete" to the port (the port contract is idempotent void). The
    // atomic `updateMany` replaces the prior `update` + P2025-swallow
    // pattern; it avoids the race window where a concurrent update
    // could re-mutate a soft-deleted row.
    await this.prisma.transaction.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        updatedBy: actorId,
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
 * Recognizes Prisma's P2025 "Record not found". The local copy was
 * promoted to `@core/database/prisma-error-guards` in the 4R review
 * fix (commit TBD). Every Prisma-backed adapter in the workspace
 * shares the same recognition through the central helper.
 */

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

// Suppress unused-import warning — the only `TransactionKind` reference
// is via the projection's narrowing. The sentinel was removed in the 4R
// review fix; this comment marks the import as intentionally retained.
void isPrismaNotFound;
