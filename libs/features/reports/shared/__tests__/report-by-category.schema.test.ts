import { describe, expect, it } from 'vitest';
import { reportByCategorySchema } from '../schemas/report-by-category.schema.js';

describe('reportByCategorySchema', () => {
  const validBreakdown = {
    categoryId: 'cm1abc2de3f',
    categoryName: 'Food',
    total: '-150.00',
    transactionCount: 3,
    share: 0.6,
  };

  describe('happy path', () => {
    it('accepts a valid category breakdown', () => {
      const result = reportByCategorySchema.safeParse(validBreakdown);
      expect(result.success).toBe(true);
    });

    it('accepts share=0', () => {
      const result = reportByCategorySchema.safeParse({ ...validBreakdown, share: 0 });
      expect(result.success).toBe(true);
    });

    it('accepts share=1', () => {
      const result = reportByCategorySchema.safeParse({ ...validBreakdown, share: 1 });
      expect(result.success).toBe(true);
    });
  });

  describe('share range', () => {
    it('rejects share < 0', () => {
      const result = reportByCategorySchema.safeParse({ ...validBreakdown, share: -0.1 });
      expect(result.success).toBe(false);
    });

    it('rejects share > 1', () => {
      const result = reportByCategorySchema.safeParse({ ...validBreakdown, share: 1.1 });
      expect(result.success).toBe(false);
    });
  });

  describe('cuid', () => {
    it('rejects non-cuid categoryId', () => {
      const result = reportByCategorySchema.safeParse({
        ...validBreakdown,
        categoryId: 'not-a-cuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('required fields', () => {
    it('rejects missing categoryName', () => {
      const { categoryName: _name, ...rest } = validBreakdown;
      const result = reportByCategorySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing transactionCount', () => {
      const { transactionCount: _tc, ...rest } = validBreakdown;
      const result = reportByCategorySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('strict shape (no unknown keys)', () => {
    it('rejects unknown keys', () => {
      const result = reportByCategorySchema.safeParse({ ...validBreakdown, evil: 'value' });
      expect(result.success).toBe(false);
    });
  });
});
