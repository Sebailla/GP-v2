import { describe, expect, it } from 'vitest';
import { reportSummarySchema } from '../schemas/report-summary.schema.js';

describe('reportSummarySchema', () => {
  const validSummary = {
    fromDate: '2026-07-01',
    toDate: '2026-08-01',
    currencyCode: 'USD',
    income: '150.00',
    expense: '-100.00',
    net: '50.00',
    transactionCount: 5,
    fxFreshness: 'fresh' as const,
  };

  describe('happy path', () => {
    it('accepts a valid summary', () => {
      const result = reportSummarySchema.safeParse(validSummary);
      expect(result.success).toBe(true);
    });

    it('accepts fxFreshness="stale"', () => {
      const result = reportSummarySchema.safeParse({ ...validSummary, fxFreshness: 'stale' });
      expect(result.success).toBe(true);
    });

    it('accepts transactionCount=0', () => {
      const result = reportSummarySchema.safeParse({
        ...validSummary,
        transactionCount: 0,
        income: '0',
        expense: '0',
        net: '0',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('required fields', () => {
    it('rejects missing income', () => {
      const { income: _income, ...rest } = validSummary;
      const result = reportSummarySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing fxFreshness', () => {
      const { fxFreshness: _fx, ...rest } = validSummary;
      const result = reportSummarySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('decimal strings', () => {
    it('accepts Decimal-stringified numbers (positive)', () => {
      const result = reportSummarySchema.safeParse({ ...validSummary, income: '1234567.89' });
      expect(result.success).toBe(true);
    });

    it('accepts Decimal-stringified numbers (negative)', () => {
      const result = reportSummarySchema.safeParse({ ...validSummary, expense: '-1234567.89' });
      expect(result.success).toBe(true);
    });

    it('rejects raw numbers (force string serialization at the seam)', () => {
      const result = reportSummarySchema.safeParse({ ...validSummary, income: 150 });
      expect(result.success).toBe(false);
    });
  });

  describe('fxFreshness enum', () => {
    it('rejects values outside the enum', () => {
      const result = reportSummarySchema.safeParse({ ...validSummary, fxFreshness: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('strict shape (no unknown keys)', () => {
    it('rejects unknown keys', () => {
      const result = reportSummarySchema.safeParse({ ...validSummary, evil: 'value' });
      expect(result.success).toBe(false);
    });
  });
});
