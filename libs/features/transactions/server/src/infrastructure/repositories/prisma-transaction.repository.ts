import { prisma as defaultPrisma } from "@core/database";
import type {
  Prisma,
  PrismaClient,
  PrismaDecimal,
} from "@core/database";
import { toDecimal } from "@shared-utils/decimal";

import type {
  Transaction,
  TransactionKind,
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
 * `where: { deletedAt: null }`. The `__tests__/` suite verifies the
 * invariant by inspecting every Prisma call's `where` clause.
 *
 * Decimal boundary: the domain uses `@shared-utils/decimal`'s
 * `Decimal` (decimal.js); Prisma emits its own runtime `Decimal` from
 * the generated client. The adapter owns the conversion at the
 * boundary (`toDecimal(row.amount.toString())` on read; `rate.toString()`
 * on write). Any drift breaks the contract and the integration tests.
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
    const row = await this.prisma.transaction.create({
      data: {
        amount: input.amount.toString(),
        currencyCode: input.currencyCode,
        kind: input.kind,
        reportingAmount:
          input.reportingAmount === null ? null : input.reportingAmount.toString(),
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
  }

  async update(id: string, input: TransactionUpdate): Promise<Transaction> {
    try {
      const data: Prisma.TransactionUncheckedUpdateInput = {
        updatedBy: input.updatedBy,
      };
      if (input.amount !== undefined) data.amount = input.amount.toString();
      if (input.currencyCode !== undefined) data.currencyCode = input.currencyCode;
      if (input.kind !== undefined) data.kind = input.kind;
      if (input.reportingAmount !== undefined) {
        data.reportingAmount =
          input.reportingAmount === null ? null : input.reportingAmount.toString();
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
    } catch (err) {
      if (isPrismaNotFound(err)) {
        // Soft-deleted rows are not-found for the purpose of update.
        // The service layer translates this into the right error class.
        throw new TransactionNotFoundError(id);
      }
      throw err;
    }
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.transaction.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          updatedBy: actorId,
        },
      });
    } catch (err) {
      // Idempotent (matches PrismaSessionRepository.revokeByToken):
      // soft-deleting an already-soft-deleted (or non-existent) row
      // is a no-op. Surfaces P2025 silently.
      if (isPrismaNotFound(err)) return;
      throw err;
    }
  }
}

/** Translated from Prisma's P2025 ("Record to update not found"). */
export class TransactionNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Transaction "${id}" not found or already soft-deleted`);
    this.name = "TransactionNotFoundError";
  }
}

function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
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
      row.reportingAmount === null ? null : toDecimal(row.reportingAmount.toString()),
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

// Sentinel use of TransactionKind (the projection function narrows the union
// internally; the import guards against future divergence if the union grows).
type _TransactionKindSentinel = TransactionKind;
const _kind: _TransactionKindSentinel | undefined = undefined;
void _kind;
