import { defineConfig } from "vitest/config";

/**
 * Vitest config for @features/transactions.
 *
 * Mirrors the auth slice convention: the Zod schemas live under
 * `../shared/schemas/__tests__/` (per design §5.5 + the slice-wide
 * ESLint rule `no-schemas-outside-shared`), and the server package's
 * vitest picks both up so a single `pnpm --filter @features/transactions
 * exec vitest run` discovers every transactions-slice test.
 *
 * Slice 5 PR #1 ships only RED-GREEN tests for the canonical Zod schemas
 * (T5.4). Behavior tests for services (T5.3 + T5.9 + T5.12) and the
 * Prisma adapter soft-delete invariant (T5.7 + D-TX-5 verification) land
 * in PR #2 / PR #3.
 */
export default defineConfig({
  test: {
    include: [
      "src/__tests__/**/*.test.ts",
      "../shared/schemas/__tests__/**/*.test.ts",
      "../docs/__tests__/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
});
