import { describe, expect, it } from 'vitest';
import {
  timeBucketService,
  type TransactionForReport,
} from '../time-bucket.service.js';

/**
 * TRIANGULATE pass for TimeBucketService — additional edge cases that
 * the RED test didn't cover. Per Strict TDD, these come after the
 * GREEN implementation; they tighten the contract without changing
 * the behavior.
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

describe('timeBucketService.bucketize — triangulation', () => {
  describe('decimal precision', () => {
    it('sums Decimal strings without precision loss (within 2dp)', () => {
      // Use explicit amounts to avoid the tx() default of -10.00.
      const txs = [
        tx({ id: '1', amount: '-0.1' }),
        tx({ id: '2', amount: '-0.2' }),
        tx({ id: '3', amount: '-0.3' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      // -0.1 + -0.2 + -0.3 in JS = -0.6000000000000001 (classic float bug).
      // The toFixed(2) truncates back to '-0.60'.
      expect(result[0]?.expense).toBe('-0.60');
    });

    it('sums large amounts without overflow (within safe integer range)', () => {
      const txs = [
        tx({ id: '1', amount: '1000000.00' }),
        tx({ id: '2', amount: '2000000.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result[0]?.income).toBe('3000000.00');
    });
  });

  describe('leap day handling', () => {
    it('groups a transaction on Feb 29 (leap year) into the February bucket', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2024-02-29T12:00:00Z'), amount: '-100.00' }),
        tx({ id: '2', occurredAt: new Date('2024-03-01T00:00:00Z'), amount: '-50.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2024-02-01',
        toDate: '2024-04-01',
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe('2024-02');
      expect(result[0]?.expense).toBe('-100.00');
      expect(result[1]?.label).toBe('2024-03');
      expect(result[1]?.expense).toBe('-50.00');
    });
  });

  describe('cross-year transitions', () => {
    it('handles transactions across year boundaries correctly', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2025-12-31T23:59:00Z'), amount: '-10.00' }),
        tx({ id: '2', occurredAt: new Date('2026-01-01T00:00:00Z'), amount: '-20.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2025-12-01',
        toDate: '2026-02-01',
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.label).toBe('2025-12');
      expect(result[1]?.label).toBe('2026-01');
    });

    it('week bucket handles ISO week 1 of a new year (Jan 4 anchor rule)', () => {
      // Per ISO 8601, week 1 of year Y is the week containing the
      // first Thursday of year Y. 2026-01-01 is a Thursday, so W01-2026
      // starts on Monday 2025-12-29. Therefore 2026-01-04 (Sunday) is
      // the last day of W01-2026, NOT of W53-2025.
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-01-04T12:00:00Z') }),
        tx({ id: '2', occurredAt: new Date('2025-12-29T12:00:00Z') }),
      ];
      const result = timeBucketService.bucketize(txs, 'week', {
        fromDate: '2025-12-29',
        toDate: '2026-01-05',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.label).toBe('2026-W01');
    });
  });

  describe('exact duplicates', () => {
    it('preserves all transactions when multiple share the same id (no dedup)', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-15T12:00:00Z'), amount: '-10.00' }),
        tx({ id: '1', occurredAt: new Date('2026-07-15T12:00:00Z'), amount: '-10.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      // Both transactions are kept (the service does not dedup — that's
      // a repository-level concern).
      expect(result[0]?.transactions).toHaveLength(2);
      expect(result[0]?.expense).toBe('-20.00');
    });
  });

  describe('transactions at exact boundaries', () => {
    it('includes a transaction at exactly the fromDate timestamp', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-07-01T00:00:00Z'), amount: '-10.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.transactions).toHaveLength(1);
    });

    it('excludes a transaction at exactly the toDate timestamp (half-open)', () => {
      const txs = [
        tx({ id: '1', occurredAt: new Date('2026-08-01T00:00:00Z'), amount: '-10.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result).toEqual([]);
    });
  });

  describe('all-zero amounts', () => {
    it('treats a zero-amount transaction as income (>= 0)', () => {
      const txs = [
        tx({ id: '1', amount: '0' }),
        tx({ id: '2', amount: '0.00' }),
      ];
      const result = timeBucketService.bucketize(txs, 'month', {
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result[0]?.income).toBe('0.00');
      expect(result[0]?.expense).toBe('0.00');
      expect(result[0]?.net).toBe('0.00');
    });
  });
});
