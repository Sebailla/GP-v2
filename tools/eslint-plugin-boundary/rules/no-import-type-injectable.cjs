"use strict";

/**
 * Forbid `import { type X }` for NestJS injectable classes.
 *
 * STUB — see `openspec/changes/fix-api-nestjs-di/design.md` §2 File 4
 * for the full rule body that lands in T5 (GREEN). This stub is
 * intentionally empty so the runner's `pnpm lint:fixtures` fails on
 * the invalid fixture (`expected >=1 errors, got 0`) — the RED state
 * that proves the runner + fixture infrastructure is wired correctly
 * BEFORE the rule body itself is implemented.
 *
 * The stub keeps the rule's `module.exports = { meta, create }`
 * shape so the plugin loads it without throwing, and `create`
 * returns an empty visitor set so every fixture reports 0 errors.
 * The runner then fails with:
 *   FAIL no-import-type-injectable/invalid.ts: expected >=1 errors, got 0
 * which is exactly the RED signal T4 needs.
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "STUB. Forbid `import { type X }` for NestJS injectable classes — full body lands in T5.",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      forbiddenImportType:
        "STUB: full rule body lands in T5 (no-import-type-injectable).",
    },
  },

  create(_context) {
    // Intentional no-op visitor: every ImportDeclaration is a no-op,
    // so the invalid fixture reports 0 errors and the runner fails.
    return {};
  },
};