import { describe, expect, it } from 'vitest';
import {
  timeBucketService,
  type Bucket,
  type TransactionForReport,
} from '../time-bucket.service.js';

/**
 * Helper: build a minimal TransactionForReport for tests.
 */
function tx(overrides: Partial<TransactionForReport> = {}): TransactionForReport {
  return {
    id: 'cm1tx1',
    userId: 'cm1user1',
    occurredAt: new Date('2026-07-15T12:00:00Z'),
    amount: '-10.00',
    currencyCode: 'USD',
    categoryId: 'cm1cat1',
    categoryName: 'Food',
    ...overrides,
  };
}

describe('timeBucketService.bucketize', () => {
  describe('empty inputs', () => {
    it('returns [] for an empty transactions array', () => {
      const result = timeBucketService.bucketize([], 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toEqual([]);
    });

    it('returns [] for an inverted range', () => {
      const result = timeBucketService.bucketize([tx()], 'month', {
        fromDate: '2026-08-01',
        toDate: '2026-07-01',
      });
      expect(result).toEqual([]);
    });

    it('returns [] when the only transaction is outside the range', () => {
      const result = timeBucketService.bucketize(
        [tx({ occurredAt: new Date('2025-01-15T12:00:00Z') })],
        'month',
        { fromDate: '2026-07-01', toDate: '2026-08-01' },
      );
      expect(result).toEqual([]);
    });
  });

  describe('month bucket', () => {
    it('groups all transactions in the same month into one bucket', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-01T10:00:00Z'), amount: '-10.00' }),
        tx({ id: '2', occurredAt: new Date('2026-07-15T12:00:00Z'), amount: '-20.00' }),
        tx({ id: '3', occurredAt: new Date('2026-07-31T23:59:00Z'), amount: '-30.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.label).toBe('2026-07');
      expect(result[0]?.transactions).toHaveLength(3);
      expect(result[0]?.expense).toBe('-60.00');
      expect(result[0]?.net).toBe('60.00');
    });

    it('produces one bucket per month when range spans multiple months', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-15T12:00:00Z'), amount: '-10.00' }),
        tx({ id: '2', occurredAt: new Date('2026-08-15T12:00:00Z'), amount: '-20.00' }),
        tx({ id: '3', occurredAt: new Date('2026-09-15T12:00:00Z'), amount: '-30.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-10-01',
      });
      expect(result).toHaveLength(3);
      expect(result.map((b) => b.label)).toEqual(['2026-07', '2026-08', '2026-09']);
      expect(result[0]?.expense).toBe('-10.00');
      expect(result[1]?.expense).toBe('-20.00');
      expect(result[2]?.expense).toBe('-30.00');
    });

    it('sums income and expense separately (sign-aware)', () => {
      const txs = [
        tx({ id: '1', amount: '100.00' }), // income
        tx({ id: '2', amount: '-50.00' }), // expense
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.income).toBe('100.00');
      expect(result[0]?.expense).toBe('-50.00');
      expect(result[0]?.net).toBe('50.00');
    });
  });

  describe('week bucket (ISO-8601 weeks, Mon-Sun)', () => {
    it('groups transactions by ISO week', () => {
      // 2026-07-13 is a Monday, 2026-07-19 is Sunday — ISO week 2026-W29
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-13T12:00:00Z') }),
        tx({ id: '2', occurredAt: new Date('2026-07-15T12:00:00Z') }),
        tx({ id: '3', occurredAt: new Date('2026-07-19T12:00:00Z') }),
      ];
      const result = timeBucketService.bucketize(txs, 'week', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.label).toBe('2026-W29');
    });

    it('produces two buckets for transactions across two adjacent weeks', () => {
      // 2026-07-13 (Mon, W29) and 2026-07-20 (Mon, W30)
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-13T12:00:00Z'), amount: '-10.00' }),
        tx({ id: '2', occurredAt: new Date('2026-07-20T12:00:00Z'), amount: '-20.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'week', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe('2026-W29');
      expect(result[1]?.label).toBe('2026-W30');
    });

    it('handles ISO week 53 boundary (years with 53 ISO weeks)', () => {
      // 2020 had 53 ISO weeks. 2020-12-31 is in week 2020-W53.
      const txs = [
        tx({ id: '1', occurredAt: new Date('2020-12-31T12:00:00Z'), amount: '-10.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'week', {
        fromDate: '2020-12-01',
        toDate: '2021-01-31',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.label).toBe('2020-W53');
    });
  });

  describe('range filtering (half-open [fromDate, toDate))', () => {
    it('excludes transactions before fromDate', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-06-30T23:59:00Z'), amount: '-10.00' }),
        tx({ id: '2', occurredAt: new Date('2026-07-01T00:00:00Z'), amount: '-20.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.transactions).toHaveLength(1);
      expect(result[0]?.transactions[0]?.id).toBe('2');
    });

    it('excludes transactions on or after toDate (half-open)', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-31T23:59:00Z'), amount: '-10.00' }),
        tx({ id: '2', occurredAt: new Date('2026-08-01T00:00:00Z'), amount: '-20.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.transactions).toHaveLength(1);
      expect(result[0]?.transactions[0]?.id).toBe('1');
    });
  });

  describe('chronological order', () => {
    it('returns buckets in chronological order (oldest first)', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-09-15T12:00:00Z') }),
        tx({ id: '2', occurredAt: new Date('2026-07-15T12:00:00Z') }),
        tx({ id: '3', occurredAt: new Date('2026-08-15T12:00:00Z') }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-10-01',
      });
      expect(result.map((b) => b.label)).toEqual(['2026-07', '2026-08', '2026-09']);
    });
  });

  describe('bucket metadata', () => {
    it('reports fromDate and toDate for each bucket', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-15T12:00:00Z') }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result[0]?.fromDate).toBe('2026-07-01');
      expect(result[0]?.toDate).toBe('2026-08-01');
    });
  });

  describe('Bucket type narrowing', () => {
    it('type system prevents unsupported bucket values', () => {
      // Type-level test: this is a compile-time guarantee, not runtime.
      // We assert that the service signature accepts only 'week' | 'month'.
      const bucket: Bucket = 'month';
      const result = timeBucketService.bucketize([tx()], bucket, {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toBeDefined();
    });
  });
});
