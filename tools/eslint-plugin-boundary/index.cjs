"use strict";

/**
 * Local ESLint plugin enforcing the vertical-slicing architecture
 * boundaries for gastos-personales-reference.
 *
 * Four non-negotiable rules + one optional doc-mirror rule:
 *
 *   - no-client-server-import
 *   - no-cross-module-import
 *   - no-prisma-outside-core
 *   - no-schemas-outside-shared
 *   - no-mojibake-in-docs (optional)
 *
 * The plugin's `recommended` config wires all five rules with the
 * globs from design section 3.4. The runner script
 * `scripts/run-fixtures.mjs` exercises each rule against its
 * valid/invalid fixture pair so a silent regression is caught at
 * fixture time.
 */

const noClientServerImport = require("./rules/no-client-server-import.cjs");
const noCrossModuleImport = require("./rules/no-cross-module-import.cjs");
const noPrismaOutsideCore = require("./rules/no-prisma-outside-core.cjs");
const noSchemasOutsideShared = require("./rules/no-schemas-outside-shared.cjs");
const noMojibakeInDocs = require("./rules/no-mojibake-in-docs.cjs");

// Build the plugin object in two steps so configs can reference `plugin`
// without tripping the temporal dead zone.
const plugin = {
  meta: {
    name: "@gpr/eslint-plugin-boundary",
    version: "0.0.0",
  },
  rules: {
    "no-client-server-import": noClientServerImport,
    "no-cross-module-import": noCrossModuleImport,
    "no-prisma-outside-core": noPrismaOutsideCore,
    "no-schemas-outside-shared": noSchemasOutsideShared,
    "no-mojibake-in-docs": noMojibakeInDocs,
  },
};

// Attach configs after the plugin object exists.
plugin.configs = {
  recommended: {
    plugins: {
      "@gpr/boundary": plugin,
    },
    rules: {
      "@gpr/boundary/no-prisma-outside-core": "error",
      "@gpr/boundary/no-schemas-outside-shared": "error",
      "@gpr/boundary/no-mojibake-in-docs": "error",
    },
  },
  "client-only": {
    files: ["libs/features/*/client/**/*.{ts,tsx}"],
    rules: {
      "@gpr/boundary/no-client-server-import": "error",
    },
  },
  "features-only": {
    files: ["libs/features/**/*.ts"],
    rules: {
      "@gpr/boundary/no-cross-module-import": "error",
    },
  },
};

module.exports = plugin;