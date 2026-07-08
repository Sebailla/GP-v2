"use strict";

/**
 * Forbid direct cross-module imports between libs/features modules.
 *
 * Glob (per design section 3.4): libs/features/<any>.ts
 *
 * Allowed:
 *   - same-module imports (file in libs/features/auth/<any> may import
 *     libs/features/auth/<other>)
 *   - imports via @core/events (the cross-module communication port)
 *
 * Disallowed: libs/features/auth/<any> importing from
 * libs/features/transactions/<any> directly.
 *
 * Aliases such as @features/<x>/<rest> are normalized to
 * libs/features/<x>/<rest> before the module name is extracted.
 */

const MODULE_RE = /(?:^|\/)(?:libs|@features)\/features\/([^/]+)\//;

function extractModuleFromFilename(filename) {
  if (!filename) return null;
  const normalized = filename.replace(/\\/g, "/");
  const m = normalized.match(MODULE_RE);
  return m ? m[1] : null;
}

function extractModuleFromSource(source) {
  if (typeof source !== "string") return null;
  let normalized = source.replace(/\\/g, "/");
  if (normalized.startsWith("@features/")) {
    normalized = `libs/features/${normalized.slice("@features/".length)}`;
  } else if (normalized.startsWith("@")) {
    return null;
  }
  const m = normalized.match(MODULE_RE);
  return m ? m[1] : null;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid direct cross-feature imports between libs/features modules (use @core/events or a shared port instead).",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      crossModuleImport:
        "Cross-module import: '{{ source }}' reaches into module '{{ target }}' from module '{{ self }}'. Route through @core/events or expose a shared port in libs/core/<any>.",
    },
  },

  create(context) {
    const selfModule = extractModuleFromFilename(context.filename);
    if (!selfModule) return {};

    function checkImport(node, source) {
      if (typeof source !== "string") return;
      const targetModule = extractModuleFromSource(source);
      if (!targetModule) return;
      if (targetModule === selfModule) return;
      if (
        source.startsWith("@core/events") ||
        source.includes("libs/core/events/")
      ) {
        return;
      }
      context.report({
        node,
        messageId: "crossModuleImport",
        data: {
          source,
          self: selfModule,
          target: targetModule,
        },
      });
    }

    return {
      ImportDeclaration(node) {
        checkImport(node, node.source && node.source.value);
      },
      ExportAllDeclaration(node) {
        checkImport(node, node.source && node.source.value);
      },
      ExportNamedDeclaration(node) {
        checkImport(node, node.source && node.source.value);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") {
          checkImport(node, node.source.value);
        }
      },
    };
  },
};