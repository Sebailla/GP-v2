"use strict";

/**
 * Forbid `new PrismaClient()` outside libs/core/database/src/.
 *
 * Glob (per design section 3.4): <any>/<any>.{ts,tsx}
 * Path whitelist: libs/core/database/src/<any>
 *
 * The single PrismaClient instance is exported from
 * libs/core/database/src/client.ts and re-exported as @core/database.
 * Any other file instantiating its own client will leak connections,
 * drift schema versions, and bypass the singleton logging hooks.
 */

const ALLOWED_DIR = "libs/core/database/src";

function isAllowed(filename) {
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, "/");
  return normalized.includes(`/${ALLOWED_DIR}/`) || normalized.endsWith(`/${ALLOWED_DIR}`);
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid `new PrismaClient()` outside libs/core/database/src/.",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      prismaClientOutsideCore:
        "`new PrismaClient()` is only allowed in {{ allowed }}; found in '{{ file }}'. Import the singleton from '@core/database' instead.",
    },
  },

  create(context) {
    return {
      NewExpression(node) {
        if (!node.callee) return;
        const isPrismaClient =
          (node.callee.type === "Identifier" && node.callee.name === "PrismaClient") ||
          (node.callee.type === "MemberExpression" &&
            node.callee.property &&
            node.callee.property.name === "PrismaClient");
        if (!isPrismaClient) return;

        if (isAllowed(context.filename)) return;

        context.report({
          node,
          messageId: "prismaClientOutsideCore",
          data: {
            allowed: ALLOWED_DIR,
            file: context.filename,
          },
        });
      },
    };
  },
};
