import { describe, expect, it } from 'vitest';
import {
  reportQuerySchema,
  reportByPeriodQuerySchema,
  reportExportQuerySchema,
} from '../schemas/report-query.schema.js';

describe('reportQuerySchema', () => {
  describe('required fields', () => {
    it('rejects missing fromDate', () => {
      const result = reportQuerySchema.safeParse({ toDate: '2026-08-01' });
      expect(result.success).toBe(false);
    });

    it('rejects missing toDate', () => {
      const result = reportQuerySchema.safeParse({ fromDate: '2026-07-01' });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = reportQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('date format', () => {
    it('accepts ISO-8601 date strings (YYYY-MM-DD)', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-ISO-8601 strings', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '07/01/2026',
        toDate: '2026-08-01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects datetime strings (only dates accepted at the seam)', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-07-01T00:00:00Z',
        toDate: '2026-08-01',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('range cap (≤365 days)', () => {
    it('accepts a 365-day range', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-01-01',
        toDate: '2027-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a range > 365 days', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2025-01-01',
        toDate: '2027-01-01',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('inverted ranges are accepted (zero-result probe by design)', () => {
    it('accepts fromDate > toDate', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-08-01',
        toDate: '2026-07-01',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('currencyCode', () => {
    it('accepts a valid ISO-4217 code', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
        currencyCode: 'USD',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.currencyCode).toBe('USD');
    });

    it('rejects a non-ISO-4217 code', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
        currencyCode: 'usd',
      });
      expect(result.success).toBe(false);
    });

    it('treats currencyCode as optional', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.currencyCode).toBeUndefined();
    });
  });

  describe('strict shape (no unknown keys)', () => {
    it('rejects unknown keys', () => {
      const result = reportQuerySchema.safeParse({
        fromDate: '2026-07-01',
        toDate: '2026-08-01',
        evil: 'value',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('reportByPeriodQuerySchema', () => {
  it('requires bucket', () => {
    const result = reportByPeriodQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result.success).toBe(false);
  });

  it("accepts bucket='week'", () => {
    const result = reportByPeriodQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
      bucket: 'week',
    });
    expect(result.success).toBe(true);
  });

  it("accepts bucket='month'", () => {
    const result = reportByPeriodQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
      bucket: 'month',
    });
    expect(result.success).toBe(true);
  });

  it('rejects bucket outside the enum', () => {
    const result = reportByPeriodQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
      bucket: 'day',
    });
    expect(result.success).toBe(false);
  });
});

describe('reportExportQuerySchema', () => {
  it('defaults detail to summary when omitted', () => {
    const result = reportExportQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.detail).toBe('summary');
  });

  it("accepts detail='transactions'", () => {
    const result = reportExportQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
      detail: 'transactions',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.detail).toBe('transactions');
  });

  it('rejects detail outside the enum', () => {
    const result = reportExportQuerySchema.safeParse({
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
      detail: 'csv',
    });
    expect(result.success).toBe(false);
  });
});
