"use strict";

/**
 * Forbid Zod schema literals outside the allowed locations.
 *
 * Allowed:
 *   - libs/features/<x>/shared/schemas/<any>
 *   - libs/core/config/env.schema.ts
 *
 * Detected: any CallExpression whose callee matches `z.<method>`,
 * where `z` is the Zod namespace import. This includes z.object,
 * z.string, z.number, z.boolean, z.array, z.union, z.enum, z.literal,
 * z.tuple, z.record, z.coerce.<x>, z.discriminatedUnion, z.lazy, etc.
 *
 * Type imports (`import type { z } from 'zod'`) do NOT trigger;
 * only actual schema construction calls do.
 */

const ALLOWED_PATTERNS = [
  /libs\/features\/[^/]+\/shared\/schemas\//,
  /libs\/core\/config\/env\.schema\.ts$/,
  // Per design §6.2, the events catalog (kebab-case names +
  // Zod payload schemas) lives in @core/events. The schemas are
  // not feature input/output validation — they are the wire
  // contract between producers and consumers, so the single-
  // source-of-truth rule does not apply to them.
  /libs\/core\/events\/src\/types\.ts$/,
  /libs\/core\/events\/types\.ts$/,
];

function isAllowed(filename) {
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, "/");
  return ALLOWED_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Heuristic: the callee starts with `z.something(...)`.
 * Handles both `z.object(...)` and `z.coerce.string(...)`.
 */
function isZodCall(node) {
  if (!node.callee) return false;
  if (node.callee.type !== "MemberExpression") return false;
  const obj = node.callee.object;
  if (!obj) return false;

  if (obj.type === "Identifier" && obj.name === "z") return true;
  if (
    obj.type === "MemberExpression" &&
    obj.object &&
    obj.object.type === "Identifier" &&
    obj.object.name === "z"
  ) {
    return true;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid Zod schema literals outside libs/features/<x>/shared/schemas/ and libs/core/config/env.schema.ts.",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      zodSchemaOutsideShared:
        "Zod schema literal detected in '{{ file }}'. Move the schema to libs/features/<x>/shared/schemas/<name>.ts or libs/core/config/env.schema.ts so client and server reuse the same single source of truth.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (!isZodCall(node)) return;
        if (isAllowed(context.filename)) return;
        context.report({
          node,
          messageId: "zodSchemaOutsideShared",
          data: { file: context.filename },
        });
      },
    };
  },
};