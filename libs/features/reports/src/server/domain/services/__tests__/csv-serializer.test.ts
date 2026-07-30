import { describe, expect, it } from 'vitest';
import { csvSerializer } from '../csv-serializer.js';

/**
 * CSV injection guard: any cell string starting with `=`, `+`, `-`, `@`
 * is prefixed with a single quote (`'`) before serialization, so Excel
 * and Sheets do not execute it as a formula.
 *
 * Numeric cells pass through unchanged (no prefix).
 */

describe('csvSerializer.serialize', () => {
  describe('basic structure', () => {
    it('emits UTF-8 BOM prefix', () => {
      const csv = csvSerializer.serialize(
        [{ a: '1', b: '2' }],
        ['a', 'b'],
      );
      expect(csv.charCodeAt(0)).toBe(0xfeff); // U+FEFF
    });

    it('emits CRLF line endings', () => {
      const csv = csvSerializer.serialize(
        [{ a: '1', b: '2' }],
        ['a', 'b'],
      );
      expect(csv).toContain('\r\n');
      expect(csv).not.toMatch(/[^\r]\n/); // no bare \n
    });

    it('emits header row from columns', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'Alice', age: '30' }],
        ['name', 'age'],
      );
      // BOM + header + CRLF
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[0]).toBe('name,age');
    });

    it('emits one row per record, comma-separated', () => {
      const csv = csvSerializer.serialize(
        [
          { name: 'Alice', age: '30' },
          { name: 'Bob', age: '25' },
        ],
        ['name', 'age'],
      );
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines).toContain('Alice,30');
      expect(lines).toContain('Bob,25');
    });

    it('returns BOM + header only for an empty rows array', () => {
      const csv = csvSerializer.serialize([], ['name', 'age']);
      expect(csv.replace(/^\uFEFF/, '')).toBe('name,age\r\n');
    });
  });

  describe('column ordering', () => {
    it('emits columns in the order specified, not the object key order', () => {
      const csv = csvSerializer.serialize(
        [{ a: '1', b: '2', c: '3' }],
        ['c', 'a', 'b'],
      );
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[0]).toBe('c,a,b');
      expect(lines[1]).toBe('3,1,2');
    });
  });

  describe('value coercion', () => {
    it('emits strings as-is', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'Alice' }],
        ['name'],
      );
      expect(csv).toContain('Alice');
    });

    it('emits numbers as their string form', () => {
      const csv = csvSerializer.serialize(
        [{ count: 42 }, { count: -3.14 }],
        ['count'],
      );
      expect(csv).toContain('42');
      expect(csv).toContain('-3.14');
    });

    it('emits null as empty string', () => {
      const csv = csvSerializer.serialize(
        [{ name: null }],
        ['name'],
      );
      expect(csv.replace(/^\uFEFF/, '')).toContain('\r\n\r\n');
    });

    it('emits undefined as empty string', () => {
      const csv = csvSerializer.serialize(
        [{ name: undefined }],
        ['name'],
      );
      expect(csv.replace(/^\uFEFF/, '')).toContain('\r\n\r\n');
    });
  });

  describe('special character escaping', () => {
    it('wraps cells containing comma in double quotes', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'Smith, John' }],
        ['name'],
      );
      expect(csv).toContain('"Smith, John"');
    });

    it('wraps cells containing double quote and doubles the inner quote', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'She said "hi"' }],
        ['name'],
      );
      expect(csv).toContain('"She said ""hi"""');
    });

    it('wraps cells containing CR or LF in double quotes', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'line1\nline2' }, { name: 'line3\rline4' }],
        ['name'],
      );
      expect(csv).toContain('"line1\nline2"');
      expect(csv).toContain('"line3\rline4"');
    });

    it('does not quote cells without special characters', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'Alice' }],
        ['name'],
      );
      expect(csv).toContain('Alice\r\n');
      expect(csv).not.toContain('"Alice"');
    });
  });

  describe('CSV injection guard (formula prefix)', () => {
    it('prefixes a cell starting with =', () => {
      const csv = csvSerializer.serialize(
        [{ formula: '=cmd|\'/c calc\'!A0' }],
        ['formula'],
      );
      expect(csv).toContain("'=cmd|'/c calc'!A0");
    });

    it('prefixes a cell starting with +', () => {
      const csv = csvSerializer.serialize(
        [{ formula: '+1+1' }],
        ['formula'],
      );
      expect(csv).toContain("'+1+1");
    });

    it('prefixes a cell starting with -', () => {
      const csv = csvSerializer.serialize(
        [{ formula: '-2*3' }],
        ['formula'],
      );
      expect(csv).toContain("'-2*3");
    });

    it('prefixes a cell starting with @', () => {
      const csv = csvSerializer.serialize(
        [{ formula: '@SUM(A1:A10)' }],
        ['formula'],
      );
      expect(csv).toContain("'@SUM(A1:A10)");
    });

    it('does NOT prefix a cell starting with a letter that is not a formula trigger', () => {
      const csv = csvSerializer.serialize(
        [{ text: 'Alice' }],
        ['text'],
      );
      expect(csv).toContain('Alice');
      expect(csv).not.toContain("'Alice");
    });

    it('does NOT prefix numeric cells (no leading quote for negative numbers)', () => {
      const csv = csvSerializer.serialize(
        [{ amount: -100.5 }],
        ['amount'],
      );
      expect(csv).toContain('-100.5');
      expect(csv).not.toContain("'-100.5");
    });

    it('guards mid-string formula triggers (only the LEADING char counts)', () => {
      // Excel only auto-executes formulas at the start of a cell.
      // Mid-string "=" is just text.
      const csv = csvSerializer.serialize(
        [{ text: 'foo=bar' }],
        ['text'],
      );
      // The leading 'f' is safe, so no prefix needed.
      // But 'foo=bar' contains ',' check that we're not over-quoting.
      expect(csv).toContain('foo=bar');
    });

    it('combines injection guard with quote-escaping', () => {
      const csv = csvSerializer.serialize(
        [{ text: '=A"1' }],
        ['text'],
      );
      // Should be: leading ' for injection guard, then wrap in quotes, double the inner quote.
      expect(csv).toContain('"\'=A""1"');
    });
  });

  describe('encoding round-trip', () => {
    it('UTF-8 BOM is exactly 3 bytes (0xEF, 0xBB, 0xBF)', () => {
      const csv = csvSerializer.serialize(
        [{ a: '1' }],
        ['a'],
      );
      const buf = Buffer.from(csv, 'utf8');
      expect(buf[0]).toBe(0xef);
      expect(buf[1]).toBe(0xbb);
      expect(buf[2]).toBe(0xbf);
    });
  });
});
