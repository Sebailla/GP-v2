import { describe, expect, it } from 'vitest';
import { csvSerializer } from '../csv-serializer.js';

/**
 * TRIANGULATE pass for csvSerializer — additional edge cases that the
 * RED test didn't cover. Per Strict TDD, these come after the GREEN
 * implementation; they tighten the contract without changing the
 * behavior.
 */

describe('csvSerializer.serialize — triangulation', () => {
  describe('multiple columns', () => {
    it('emits all columns in the order specified', () => {
      const csv = csvSerializer.serialize(
        [
          { name: 'Alice', age: '30', city: 'NYC' },
          { name: 'Bob', age: '25', city: 'LA' },
        ],
        ['name', 'age', 'city'],
      );
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[0]).toBe('name,age,city');
      expect(lines[1]).toBe('Alice,30,NYC');
      expect(lines[2]).toBe('Bob,25,LA');
    });

    it('emits empty cells for missing keys', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'Alice' }], // missing 'age' and 'city'
        ['name', 'age', 'city'],
      );
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[1]).toBe('Alice,,');
    });

    it('ignores extra keys in the row not in the columns list', () => {
      const csv = csvSerializer.serialize(
        [{ name: 'Alice', age: '30', extra: 'ignored' }],
        ['name', 'age'],
      );
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[0]).toBe('name,age');
      expect(lines[1]).toBe('Alice,30');
      expect(csv).not.toContain('ignored');
    });
  });

  describe('mixed special characters', () => {
    it('quotes and escapes a cell with comma + double quote + CR + LF + formula', () => {
      const csv = csvSerializer.serialize(
        [{ text: '=a,b"c\r\nd' }],
        ['text'],
      );
      // Walk the expected output character by character:
      // Input:  =, a, ,, b, ", c, CR, LF, d  (the " is between b and c)
      // After injection guard: ', =, a, ,, b, ", c, CR, LF, d
      // After RFC 4180 quoting (comma + " + CR + LF trigger quoting):
      //   ", ', =, a, ,, b, ", ", c, CR, LF, d, "
      // which is: "'"=a,b""c\r\nd"
      const expected = '"\'=a,b""c\r\nd"';
      expect(csv).toContain(expected);
    });
  });

  describe('round-trip parsing', () => {
    it('a standard CSV parser can recover the original values', () => {
      const records = [
        { name: 'Alice', formula: '=cmd', text: 'has,comma', note: 'has"quote' },
        { name: 'Bob', formula: '+1', text: 'plain', note: 'multi\nline' },
      ];
      const csv = csvSerializer.serialize(records, ['name', 'formula', 'text', 'note']);

      // Strip BOM, split on CRLF, drop trailing empty line.
      const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
      expect(lines).toHaveLength(1 + records.length); // header + rows

      // Header.
      expect(lines[0]).toBe('name,formula,text,note');

      // Row 1.
      // formula = "=cmd" → "'=cmd" (injection guard).
      // text = "has,comma" → '"has,comma"' (quote due to comma).
      // note = 'has"quote' → '"has""quote"' (quote + inner doubled).
      expect(lines[1]).toBe('Alice,\'=cmd,"has,comma","has""quote"');

      // Row 2.
      // formula = "+1" → "'+1" (injection guard).
      // note = 'multi\nline' → '"multi\nline"' (quote due to LF).
      expect(lines[2]).toBe('Bob,\'+1,plain,"multi\nline"');
    });
  });

  describe('column name injection', () => {
    it('guards the header row against formula injection', () => {
      const csv = csvSerializer.serialize(
        [{ x: '1' }],
        ['=evil()', 'normal'],
      );
      expect(csv).toContain('\'=evil(),normal');
    });
  });

  describe('numeric boundary cases', () => {
    it('does not prefix numeric cells that start with - (legitimate negative)', () => {
      const csv = csvSerializer.serialize(
        [{ amount: -100 }, { amount: -0.0001 }, { amount: 1e15 }, { amount: -1e15 }],
        ['amount'],
      );
      expect(csv).toContain('-100');
      expect(csv).toContain('-0.0001');
      expect(csv).toContain('1000000000000000');
      expect(csv).toContain('-1000000000000000');
      // Ensure no prefixed ' quotes around negatives.
      expect(csv).not.toContain("'-100");
      expect(csv).not.toContain("'-1e15");
    });

    it('prefixes string-typed cells that start with + (formula vector)', () => {
      // Even if the string looks numeric, it was supplied as a string,
      // and Excel would interpret '+100' as a formula (= 100). The guard
      // fires for any string starting with a formula trigger.
      const csv = csvSerializer.serialize(
        [{ amount: 100 }, { amount: '+100' }],
        ['amount'],
      );
      // The number 100 emits as '100' (no guard). The string '+100'
      // emits as "'+100" (guard fires).
      expect(csv).toContain('100');
      expect(csv).toContain("'+100");
    });
  });

  describe('empty and whitespace cells', () => {
    it('emits a single space as a single space (not quoted)', () => {
      const csv = csvSerializer.serialize(
        [{ text: ' ' }],
        ['text'],
      );
      expect(csv.replace(/^\uFEFF/, '')).toContain('\r\n \r\n');
    });

    it('emits an empty string as an empty cell', () => {
      const csv = csvSerializer.serialize(
        [{ text: '' }],
        ['text'],
      );
      expect(csv.replace(/^\uFEFF/, '')).toContain('\r\n\r\n');
    });
  });
});
