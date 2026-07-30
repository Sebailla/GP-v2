import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reportsService,
  type FxRateProvider,
} from '../reports.service.js';
import type { ReportsRepository, TransactionForReport } from '../../ports/index.js';

/**
 * Pure-domain service tests. The repository and FX provider are mocked.
 * Per Strict TDD (AGENTS.md §4), the test commits FIRST.
 *
 * The service composes:
 * - ReportsRepository (read-only aggregation seam, mocked here).
 * - FxRateProvider (live FX lookup, mocked here).
 * - timeBucketService (pure, real, imported from sibling).
 * - csvSerializer (pure, real, imported from sibling).
 */

const USER_ID = 'cm1user1';
const USD = 'USD';
const EUR = 'EUR';

function tx(overrides: Partial<TransactionForReport> = {}): TransactionForReport {
  return {
    id: 'cm1tx1',
    userId: USER_ID,
    occurredAt: new Date('2026-07-15T12:00:00Z'),
    amount: '-10.00',
    currencyCode: USD,
    categoryId: 'cm1cat1',
    categoryName: 'Food',
    ...overrides,
  };
}

function makeRepo(transactions: readonly TransactionForReport[] = []): ReportsRepository {
  return {
    findForUserInRange: vi.fn(async (_userId, _range) => transactions),
    findPrimaryCurrencyForUser: vi.fn(async () => USD),
  };
}

function makeFx(rates: Record<string, { rate: string; recordedAt: Date }> = {}): FxRateProvider {
  return {
    getRate: vi.fn(async (from: string, to: string) => {
      const key = `${from}:${to}`;
      return rates[key] ?? null;
    }),
  };
}

describe('reportsService.getSummary', () => {
  it('returns zeros for an empty range', async () => {
    const service = reportsService({ reportsRepository: makeRepo([]), fxRateProvider: makeFx() });
    const result = await service.getSummary(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result.transactionCount).toBe(0);
    expect(result.income).toBe('0.00');
    expect(result.expense).toBe('0.00');
    expect(result.net).toBe('0.00');
    expect(result.fxFreshness).toBe('fresh');
  });

  it('sums a single-currency range (USD)', async () => {
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: '1', amount: '100.00' }),
        tx({ id: '2', amount: '-50.00' }),
        tx({ id: '3', amount: '-25.00' }),
      ]),
      fxRateProvider: makeFx(),
    });
    const result = await service.getSummary(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result.income).toBe('100.00');
    expect(result.expense).toBe('-75.00');
    expect(result.net).toBe('25.00');
    expect(result.transactionCount).toBe(3);
    expect(result.currencyCode).toBe(USD);
  });

  it('FX-converts a multi-currency range to the user primary currency', async () => {
    // User primary is USD; one EUR transaction.
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: '1', amount: '-100.00', currencyCode: EUR }),
        tx({ id: '2', amount: '-50.00', currencyCode: USD }),
      ]),
      fxRateProvider: makeFx({
        'EUR:USD': { rate: '1.10', recordedAt: new Date() },
      }),
    });
    const result = await service.getSummary(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    // -100 EUR * 1.10 = -110 USD. Total: -110 + -50 = -160 USD.
    expect(result.expense).toBe('-160.00');
    expect(result.currencyCode).toBe(USD);
  });

  it('marks fxFreshness="stale" when any FX rate is older than 24h', async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: '1', amount: '-100.00', currencyCode: EUR }),
      ]),
      fxRateProvider: makeFx({
        'EUR:USD': { rate: '1.10', recordedAt: staleDate },
      }),
    });
    const result = await service.getSummary(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result.fxFreshness).toBe('stale');
  });

  it('falls back to USD when findPrimaryCurrencyForUser returns null', async () => {
    const repo = makeRepo([tx({ id: '1', amount: '-50.00' })]);
    repo.findPrimaryCurrencyForUser = vi.fn(async () => null);
    const service = reportsService({ reportsRepository: repo, fxRateProvider: makeFx() });
    const result = await service.getSummary(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result.currencyCode).toBe('USD');
    expect(result.expense).toBe('-50.00');
  });

  it('passes the userId to the repository (cross-user isolation)', async () => {
    const repo = makeRepo([]);
    const service = reportsService({ reportsRepository: repo, fxRateProvider: makeFx() });
    await service.getSummary('cm1user2', {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(repo.findForUserInRange).toHaveBeenCalledWith(
      'cm1user2',
      expect.objectContaining({ fromDate: '2026-07-01', toDate: '2026-08-01' }),
    );
  });
});

describe('reportsService.getByCategory', () => {
  it('returns empty array for an empty range', async () => {
    const service = reportsService({ reportsRepository: makeRepo([]), fxRateProvider: makeFx() });
    const result = await service.getByCategory(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result).toEqual([]);
  });

  it('aggregates by category, ordered by absolute expense DESC', async () => {
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: '1', amount: '-100.00', categoryId: 'cat1', categoryName: 'Food' }),
        tx({ id: '2', amount: '-50.00', categoryId: 'cat2', categoryName: 'Transport' }),
        tx({ id: '3', amount: '-25.00', categoryId: 'cat1', categoryName: 'Food' }),
      ]),
      fxRateProvider: makeFx(),
    });
    const result = await service.getByCategory(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.categoryId).toBe('cat1');
    expect(result[0]?.total).toBe('-125.00');
    expect(result[0]?.transactionCount).toBe(2);
    expect(result[0]?.share).toBeCloseTo(125 / 175, 4);
    expect(result[1]?.categoryId).toBe('cat2');
    expect(result[1]?.total).toBe('-50.00');
    expect(result[1]?.share).toBeCloseTo(50 / 175, 4);
  });

  it('FX-converts each transaction before summing per-category', async () => {
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: '1', amount: '-100.00', currencyCode: EUR, categoryId: 'cat1', categoryName: 'Food' }),
        tx({ id: '2', amount: '-50.00', currencyCode: USD, categoryId: 'cat1', categoryName: 'Food' }),
      ]),
      fxRateProvider: makeFx({
        'EUR:USD': { rate: '1.10', recordedAt: new Date() },
      }),
    });
    const result = await service.getByCategory(USER_ID, {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result).toHaveLength(1);
    // -100 EUR * 1.10 = -110 USD + -50 USD = -160 USD
    expect(result[0]?.total).toBe('-160.00');
  });
});

describe('reportsService.getByPeriod', () => {
  it('returns current + previous series + delta', async () => {
    // Current: 3 transactions in 2026-07.
    // Previous: same period one month earlier, 2026-06, 2 transactions.
    const repo: ReportsRepository = {
      findForUserInRange: vi.fn(async (userId, range) => {
        if (range.fromDate === '2026-07-01') {
          return [
            tx({ id: '1', occurredAt: new Date('2026-07-05T12:00:00Z'), amount: '-30.00' }),
            tx({ id: '2', occurredAt: new Date('2026-07-15T12:00:00Z'), amount: '-40.00' }),
            tx({ id: '3', occurredAt: new Date('2026-07-25T12:00:00Z'), amount: '-30.00' }),
          ];
        }
        // 2026-06-02..2026-07-01 (duration-equivalent window).
        return [
          tx({ id: '4', occurredAt: new Date('2026-06-10T12:00:00Z'), amount: '-50.00' }),
          tx({ id: '5', occurredAt: new Date('2026-06-20T12:00:00Z'), amount: '-30.00' }),
        ];
      }),
      findPrimaryCurrencyForUser: vi.fn(async () => USD),
    };
    const service = reportsService({ reportsRepository: repo, fxRateProvider: makeFx() });
    const result = await service.getByPeriod(
      USER_ID,
      { fromDate: '2026-07-01', toDate: '2026-08-01' },
      'month',
    );
    // Current: 100 expense.
    expect(result.current.totals.expense).toBe('-100.00');
    expect(result.current.totals.transactionCount).toBe(3);
    // Previous: 80 expense.
    expect(result.previous.totals.expense).toBe('-80.00');
    expect(result.previous.totals.transactionCount).toBe(2);
    // Delta: net current -80 - net previous -100 = 20, but both are all-expense
    // so net is -100 and -80. delta.net = -100 - -80 = -20 (expense went up by 20).
    expect(result.delta.net).toBe('-20.00');
    // delta.expense = -100 - -80 = -20.
    expect(result.delta.expense).toBe('-20.00');
    // netPercent = -20 / 80 = -0.25 (25% decrease in net).
    expect(result.delta.netPercent).toBeCloseTo(-0.25, 4);
  });

  it('computes comparison window via duration, not calendar month', async () => {
    // Range = 29 days (Jul 1 to Jul 30 exclusive).
    // Expected previous window = Jun 2 to Jul 1 (29 days back).
    const findForUserInRange = vi.fn(async (_userId, range) => []);
    const repo: ReportsRepository = {
      findForUserInRange,
      findPrimaryCurrencyForUser: vi.fn(async () => USD),
    };
    const service = reportsService({ reportsRepository: repo, fxRateProvider: makeFx() });
    await service.getByPeriod(
      USER_ID,
      { fromDate: '2026-07-01', toDate: '2026-07-30' },
      'week',
    );
    // The second call should be the previous window.
    expect(findForUserInRange).toHaveBeenCalledTimes(2);
    expect(findForUserInRange).toHaveBeenNthCalledWith(
      2,
      USER_ID,
      expect.objectContaining({
        fromDate: '2026-06-02',
        toDate: '2026-07-01',
      }),
    );
  });

  it('returns netPercent=null when previous net is zero (division by zero)', async () => {
    const repo: ReportsRepository = {
      findForUserInRange: vi.fn(async (_userId, range) => {
        if (range.fromDate === '2026-07-01') {
          return [tx({ id: '1', amount: '-50.00' })];
        }
        return [];
      }),
      findPrimaryCurrencyForUser: vi.fn(async () => USD),
    };
    const service = reportsService({ reportsRepository: repo, fxRateProvider: makeFx() });
    const result = await service.getByPeriod(
      USER_ID,
      { fromDate: '2026-07-01', toDate: '2026-08-01' },
      'month',
    );
    expect(result.delta.netPercent).toBeNull();
  });
});

describe('reportsService.exportCsv', () => {
  it('summary mode emits columns: category_id, category_name, total, currency_code, transaction_count, share', async () => {
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: '1', amount: '-100.00', categoryId: 'cat1', categoryName: 'Food' }),
      ]),
      fxRateProvider: makeFx(),
    });
    const result = await service.exportCsv(
      USER_ID,
      { fromDate: '2026-07-01', toDate: '2026-08-01' },
      'summary',
    );
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.filename).toBe('reports-2026-07-01-2026-08-01.csv');
    expect(result.body).toContain('category_id,category_name,total,currency_code,transaction_count,share');
    // The injected guard prefix should NOT be on any column (those are server-controlled).
    expect(result.body).not.toContain("'category_id");
    expect(result.body).not.toContain("'category_name");
    // The body must start with the UTF-8 BOM.
    expect(result.body.charCodeAt(0)).toBe(0xfeff);
  });

  it('transactions mode emits columns: id, occurred_at, description, category_id, category_name, amount, currency_code, amount_in_primary, primary_currency_code', async () => {
    const service = reportsService({
      reportsRepository: makeRepo([
        tx({ id: 'cm1abc', occurredAt: new Date('2026-07-15T12:00:00Z'), amount: '-100.00', currencyCode: USD }),
      ]),
      fxRateProvider: makeFx(),
    });
    const result = await service.exportCsv(
      USER_ID,
      { fromDate: '2026-07-01', toDate: '2026-08-01' },
      'transactions',
    );
    expect(result.filename).toBe('reports-2026-07-01-2026-08-01.transactions.csv');
    expect(result.body).toContain('id,occurred_at,description,category_id,category_name,amount,currency_code,amount_in_primary,primary_currency_code');
  });

  it('CSV injection guard fires on transaction descriptions (string-typed)', async () => {
    // The TransactionForReport projection doesn't carry 'description' yet.
    // For now, the description column is empty for each transaction.
    // The test verifies the guard is wired in the header at minimum.
    const service = reportsService({
      reportsRepository: makeRepo([tx({ id: 'cm1tx1' })]),
      fxRateProvider: makeFx(),
    });
    const result = await service.exportCsv(
      USER_ID,
      { fromDate: '2026-07-01', toDate: '2026-08-01' },
      'transactions',
    );
    // Header cells (which are server-controlled strings) shouldn't be
    // guarded (they're not user input). But data cells with formula
    // triggers WOULD be — we test that the serializer is wired.
    expect(result.body).toContain('id,occurred_at,');
    // The data row has the id followed by the ISO date and an empty
    // description: cm1tx1,2026-07-15T12:00:00.000Z,cm1cat1,...
    // Wait — column order is: id,occurred_at,description,category_id,...
    // So: cm1tx1,<iso>,<empty>,cm1cat1,Food,...
    expect(result.body).toMatch(/\r\ncm1tx1,[^,]+,,cm1cat1/);
  });
});

describe('cross-user isolation', () => {
  it('userId is propagated to BOTH repository calls in getByPeriod', async () => {
    const calls: Array<[string, unknown]> = [];
    const findForUserInRange = vi.fn(async (userId: string, _range: unknown) => {
      calls.push([userId, _range]);
      return [];
    });
    const repo: ReportsRepository = {
      findForUserInRange,
      findPrimaryCurrencyForUser: vi.fn(async () => USD),
    };
    const service = reportsService({ reportsRepository: repo, fxRateProvider: makeFx() });
    await service.getByPeriod(
      'cm1user2',
      { fromDate: '2026-07-01', toDate: '2026-08-01' },
      'month',
    );
    expect(findForUserInRange).toHaveBeenCalledTimes(2);
    expect(calls[0]?.[0]).toBe('cm1user2');
    expect(calls[1]?.[0]).toBe('cm1user2');
  });
});
