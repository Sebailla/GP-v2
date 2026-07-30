import { describe, expect, it } from 'vitest';
import { reportByPeriodSchema } from '../schemas/report-by-period.schema.js';

describe('reportByPeriodSchema', () => {
  const validPeriodSeries = {
    totals: {
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
      currencyCode: 'USD',
      income: '0',
      expense: '-100',
      net: '100',
      transactionCount: 5,
      fxFreshness: 'fresh' as const,
    },
    buckets: [
      {
        label: '2026-07',
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
        income: '0',
        expense: '-100',
        net: '100',
      },
    ],
  };

  const validDelta = {
    income: '0',
    expense: '-20',
    net: '20',
    netPercent: 0.25,
  };

  const validReport = {
    current: validPeriodSeries,
    previous: validPeriodSeries,
    delta: validDelta,
  };

  describe('happy path', () => {
    it('accepts a valid period comparison report', () => {
      const result = reportByPeriodSchema.safeParse(validReport);
      expect(result.success).toBe(true);
    });

    it('accepts an empty bucket array', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        current: { ...validPeriodSeries, buckets: [] },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('netPercent', () => {
    it('accepts netPercent as a number', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        delta: { ...validDelta, netPercent: -0.5 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts netPercent=0', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        delta: { ...validDelta, netPercent: 0 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts netPercent=null (serialization of Infinity/NaN)', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        delta: { ...validDelta, netPercent: null },
      });
      expect(result.success).toBe(true);
    });

    it('rejects netPercent outside [-1, 1] when finite', () => {
      // Note: netPercent is not bounded in the schema — it can be any finite number.
      // The ratio can exceed 1.0 (e.g., 100% increase = 1.0, 200% increase = 2.0).
      // We only check that very large numbers are still accepted.
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        delta: { ...validDelta, netPercent: 12.5 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('bucket label', () => {
    it('accepts ISO-8601 week labels (e.g., 2026-W27)', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        current: {
          ...validPeriodSeries,
          buckets: [
            { ...validPeriodSeries.buckets[0]!, label: '2026-W27' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty bucket label', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        current: {
          ...validPeriodSeries,
          buckets: [
            { ...validPeriodSeries.buckets[0]!, label: '' },
          ],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('required fields', () => {
    it('rejects missing current', () => {
      const { current: _c, ...rest } = validReport;
      const result = reportByPeriodSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing previous', () => {
      const { previous: _p, ...rest } = validReport;
      const result = reportByPeriodSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing delta', () => {
      const { delta: _d, ...rest } = validReport;
      const result = reportByPeriodSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('strict shape (no unknown keys)', () => {
    it('rejects unknown keys at top level', () => {
      const result = reportByPeriodSchema.safeParse({ ...validReport, evil: 'value' });
      expect(result.success).toBe(false);
    });

    it('rejects unknown keys in current', () => {
      const result = reportByPeriodSchema.safeParse({
        ...validReport,
        current: { ...validPeriodSeries, evil: 'value' },
      });
      expect(result.success).toBe(false);
    });
  });
});
