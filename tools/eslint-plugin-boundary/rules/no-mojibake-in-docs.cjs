"use strict";

/**
 * Forbid ideographic (CJK) codepoints in Spanish mirror markdown.
 *
 * The Spanish mirror under Documents-es/<any>.md should never contain
 * CJK characters because that almost always indicates auto-translation
 * drift. ASCII + extended Latin (accented Spanish) is the expected
 * character set; anything in the CJK Unified Ideographs block,
 * Hiragana / Katakana, Hangul Syllables, or Fullwidth Forms is flagged.
 *
 * The CJK detection logic lives in lib/cjk-detect.cjs so the runner
 * can reuse it for .md fixtures (ESLint's default parser does not
 * handle Markdown). To enable the rule via `pnpm turbo run lint` on
 * Markdown files, wire `@eslint/markdown` as the parser for .md
 * (deferred to slice 8 polish).
 */

const { findCjkInText } = require("../lib/cjk-detect.cjs");

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid CJK / ideographic codepoints in Spanish mirror markdown files (Documents-es/<any>.md).",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      cjkInDoc:
        "Ideographic codepoint U+{{ codeHex }} at offset {{ index }} detected in '{{ file }}'. Spanish mirrors should be ASCII + extended Latin; CJK characters usually indicate auto-translation drift.",
    },
  },

  create(context) {
    return {
      Program(node) {
        const sourceCode = context.sourceCode || context.getSourceCode();
        const text = sourceCode.getText(node);
        const hits = findCjkInText(text);
        if (hits.length === 0) return;

        const programStartOffset = sourceCode.getIndexFromLoc(node.loc.start);
        for (const hit of hits) {
          const absIndex = programStartOffset + hit.index;
          context.report({
            node,
            loc: {
              start: sourceCode.getLocFromIndex(absIndex),
              end: sourceCode.getLocFromIndex(absIndex + 1),
            },
            messageId: "cjkInDoc",
            data: {
              codeHex: hit.code.toString(16).toUpperCase().padStart(4, "0"),
              index: hit.index,
              file: context.filename,
            },
          });
        }
      },
    };
  },
};
