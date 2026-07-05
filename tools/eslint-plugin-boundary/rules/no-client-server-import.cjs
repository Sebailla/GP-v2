"use strict";

/**
 * Forbid importing from server paths into client feature slices.
 *
 * Glob (per design section 3.4): libs/features/<x>/client/<any path>/<file>.{ts,tsx}
 * The ESLint config applies this glob; the rule itself inspects the
 * import path. Inside those files, every ImportDeclaration /
 * ExportNamedDeclaration / dynamic import whose source value contains
 * /server/ reports a violation.
 *
 * Aliases such as @features/<x>/server/<rest> are matched via the
 * raw import string; the rule does not require alias resolution
 * because the /server/ substring is preserved across aliases.
 */

const SERVER_PATH = /\/server\//;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid importing from /server/ paths into /client/ feature slices.",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      clientImportsServer:
        "Client slice '{{ file }}' imports from a server path '{{ source }}'. Server code MUST NOT be reachable from client; expose a shared port or contract under libs/features/<x>/shared/ instead.",
    },
  },

  create(context) {
    function checkSource(node, source) {
      if (typeof source !== "string") return;
      if (!SERVER_PATH.test(source)) return;
      context.report({
        node,
        messageId: "clientImportsServer",
        data: {
          file: context.filename,
          source,
        },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source && node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSource(node, node.source && node.source.value);
      },
      ExportNamedDeclaration(node) {
        checkSource(node, node.source && node.source.value);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") {
          checkSource(node, node.source.value);
        }
      },
    };
  },
};