import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@core/database';

/**
 * Unit tests for PrismaReportsRepository.
 *
 * The repo's primary invariants:
 * 1. userId filter on EVERY read query (cross-user isolation).
 * 2. Sign-aware amount: Transaction.kind (income/expense) becomes +/-.
 * 3. Half-open [fromDate, toDate) range filter on occurredAt.
 * 4. Soft-deleted categories excluded.
 * 5. Order by occurredAt ASC.
 *
 * Per the repo's testing convention (AGENTS.md §10), the database
 * adapter is tested indirectly via the controller e2e tests; the unit
 * tests here exercise the SHAPE of the Prisma queries (via mock
 * inspection) rather than hitting a real Postgres. This keeps the
 * unit tests fast and avoids the integration-test machinery.
 */

type FindManyArgs = {
  where: Record<string, unknown>;
  orderBy?: unknown;
  include?: unknown;
};

// Build a Prisma client mock that captures the call args for inspection.
function makePrismaMock(rows: Array<{
  id: string;
  amount: { toString(): string };
  currencyCode: string;
  kind: 'income' | 'expense';
  categoryId: string;
  category: { name: string; deletedAt: Date | null };
  occurredAt: Date;
  createdBy: string;
}> = []) {
  const calls: { method: string; args: FindManyArgs }[] = [];
  const prisma = {
    transaction: {
      findMany: vi.fn((args: FindManyArgs) => {
        calls.push({ method: 'findMany', args });
        // Apply the where filter in-memory to simulate Prisma.
        return rows.filter((r) => {
          const w = args.where;
          if (w.createdBy !== undefined && r.createdBy !== w.createdBy) return false;
          if (w.category?.deletedAt === null && r.category.deletedAt !== null) return false;
          if (w.occurredAt?.gte !== undefined && r.occurredAt < new Date(w.occurredAt.gte)) return false;
          if (w.occurredAt?.lt !== undefined && r.occurredAt >= new Date(w.occurredAt.lt)) return false;
          return true;
        }).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      }),
    },
    currency: {
      findFirst: vi.fn(async () => null),
    },
  } as unknown as PrismaClient;
  return { prisma, calls };
}

import { PrismaReportsRepository } from '../prisma-reports.repository.js';

describe('PrismaReportsRepository.findForUserInRange', () => {
  it('passes userId to the Prisma where clause (cross-user isolation)', async () => {
    const { prisma, calls } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    expect(calls[0]?.args.where.createdBy).toBe('cm1user1');
  });

  it('uses a half-open [fromDate, toDate) range on occurredAt', async () => {
    const { prisma, calls } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    const occurredAt = calls[0]?.args.where.occurredAt as { gte: string; lt: string };
    expect(occurredAt.gte).toBe(new Date('2026-07-01T00:00:00Z').toISOString());
    expect(occurredAt.lt).toBe(new Date('2026-08-01T00:00:00Z').toISOString());
  });

  it('includes category in the query to resolve categoryName', async () => {
    const { prisma, calls } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    const include = calls[0]?.args.include as { category: { select: Record<string, boolean> } };
    expect(include.category.select.name).toBe(true);
  });

  it('filters out soft-deleted categories via category.deletedAt=null', async () => {
    const { prisma, calls } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    const where = calls[0]?.args.where as Record<string, unknown>;
    const category = where.category as { deletedAt: null };
    expect(category.deletedAt).toBeNull();
  });

  it('orders by occurredAt ASC', async () => {
    const { prisma, calls } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    const orderBy = calls[0]?.args.orderBy as { occurredAt: 'asc' | 'desc' };
    expect(orderBy.occurredAt).toBe('asc');
  });

  it('flips the sign of amount based on kind: expense becomes negative', async () => {
    const { prisma } = makePrismaMock([
      {
        id: 'tx1',
        amount: { toString: () => '100.00' },
        currencyCode: 'USD',
        kind: 'expense',
        categoryId: 'cat1',
        category: { name: 'Food', deletedAt: null },
        occurredAt: new Date('2026-07-15T12:00:00Z'),
        createdBy: 'cm1user1',
      },
    ]);
    const repo = new PrismaReportsRepository(prisma);
    const result = await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe('-100.00');
  });

  it('keeps amount positive for kind=income', async () => {
    const { prisma } = makePrismaMock([
      {
        id: 'tx1',
        amount: { toString: () => '500.00' },
        currencyCode: 'USD',
        kind: 'income',
        categoryId: 'cat1',
        category: { name: 'Salary', deletedAt: null },
        occurredAt: new Date('2026-07-15T12:00:00Z'),
        createdBy: 'cm1user1',
      },
    ]);
    const repo = new PrismaReportsRepository(prisma);
    const result = await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    expect(result[0]?.amount).toBe('500.00');
  });

  it('returns empty for an inverted range without hitting the DB', async () => {
    const { prisma } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    const result = await repo.findForUserInRange('cm1user1', { fromDate: '2026-08-01', toDate: '2026-07-01' });
    expect(result).toEqual([]);
    expect((prisma.transaction.findMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('propagates categoryName from the joined category row', async () => {
    const { prisma } = makePrismaMock([
      {
        id: 'tx1',
        amount: { toString: () => '10.00' },
        currencyCode: 'USD',
        kind: 'expense',
        categoryId: 'cat1',
        category: { name: 'Transport', deletedAt: null },
        occurredAt: new Date('2026-07-15T12:00:00Z'),
        createdBy: 'cm1user1',
      },
    ]);
    const repo = new PrismaReportsRepository(prisma);
    const result = await repo.findForUserInRange('cm1user1', { fromDate: '2026-07-01', toDate: '2026-08-01' });
    expect(result[0]?.categoryName).toBe('Transport');
    expect(result[0]?.categoryId).toBe('cat1');
  });
});

describe('PrismaReportsRepository.findPrimaryCurrencyForUser', () => {
  it('returns null when no currency is configured for the user', async () => {
    const { prisma } = makePrismaMock();
    const repo = new PrismaReportsRepository(prisma);
    const result = await repo.findPrimaryCurrencyForUser('cm1user1');
    expect(result).toBeNull();
  });
});
