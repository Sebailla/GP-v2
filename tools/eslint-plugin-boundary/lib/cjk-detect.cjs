"use strict";

/**
 * Shared CJK / ideographic codepoint detection.
 *
 * Used by:
 *   - rules/no-mojibake-in-docs.cjs  (ESLint rule, .md via Program visitor)
 *   - scripts/run-fixtures.mjs        (fixture runner, .md via direct read)
 *
 * The rule's AST visitor requires a parser that can handle the file;
 * ESLint's default parser (espree) cannot parse Markdown, so the
 * fixture runner reads .md files directly and calls into this module
 * to count violations. ESLint integration with Markdown requires the
 * @eslint/markdown plugin (deferred to a future slice).
 */

const CJK_RANGES = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0xac00, 0xd7af], // Hangul Syllables
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms (CJK punctuation)
];

function isCjkChar(code) {
  for (const [lo, hi] of CJK_RANGES) {
    if (code >= lo && code <= hi) return true;
  }
  return false;
}

/**
 * Scan text for CJK codepoints.
 * @param {string} text
 * @returns {{index: number, code: number, char: string}[]}
 */
function findCjkInText(text) {
  const hits = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (isCjkChar(code)) hits.push({ index: i, code, char: text[i] });
  }
  return hits;
}

module.exports = { CJK_RANGES, isCjkChar, findCjkInText };
