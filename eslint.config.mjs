// Root ESLint flat config for gastos-personales-reference.
//
// Applies the boundary plugin to enforce the vertical-slicing
// architecture from design section 3.4:
//   - no-prisma-outside-core  (everywhere)
//   - no-schemas-outside-shared (everywhere)
//   - no-client-server-import (libs/features/<x>/client/<any>)
//   - no-cross-module-import  (libs/features/<any>)
//   - no-mojibake-in-docs     (Documents-es/<any>.md, once the
//                              @eslint/markdown parser is wired up;
//                              the rule itself is ready today)

import boundary from "./tools/eslint-plugin-boundary/index.cjs";
import tsParser from "@typescript-eslint/parser";
import markdownPlugin from "@eslint/markdown";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/bdd-reports/**",
      "**/playwright-report/**",
      "**/test-results/**",
      // The boundary plugin's own fixtures are intentionally violating;
      // they are exercised by `pnpm lint:fixtures`, not by the
      // production lint pass.
      "tools/eslint-plugin-boundary/__fixtures__/**",
      // Next.js generates type files inside .next; ignore those.
      "**/.next/types/**",
      // Prisma generates the client into libs/core/database/src/generated;
      // ignore it (gitignored too) so lints stay focused on hand-written code.
      "**/libs/core/database/src/generated/**",
    ],
  },

  // TypeScript files: use @typescript-eslint/parser so JSX + type
  // annotations parse correctly. The boundary plugin's rules work
  // against the standard ESTree AST, which the TS parser emits.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // Markdown files: register @eslint/markdown as the language plugin.
  // The plugin exposes a `language` object ("commonmark") that ESLint's
  // flat config uses to parse Markdown. The rule block that follows
  // (Documents-es/**/*.md) reuses the `boundary` plugin to fire
  // `no-mojibake-in-docs` against the parsed AST.
  {
    files: ["**/*.md"],
    plugins: { markdown: markdownPlugin },
    language: "markdown/commonmark",
  },

  // Globally-applicable rules (no glob restriction inside the config;
  // each rule's own path check decides whether to fire).
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    ...boundary.configs.recommended,
  },

  // Spanish mirror under Documents-es/: the boundary plugin's
  // no-mojibake-in-docs rule fires here only. The rule has no
  // path filter (Program visitor + sourceCode.getText), so the
  // glob MUST be scoped to Documents-es/ to avoid false positives
  // on Spanish prose in .ts comments or anywhere else.
  {
    files: ["Documents-es/**/*.md"],
    plugins: { "@gpr/boundary": boundary },
    rules: { "@gpr/boundary/no-mojibake-in-docs": "error" },
  },

  // Client-only rules
  boundary.configs["client-only"],

  // Features-only rules
  boundary.configs["features-only"],
];
