import { defineConfig } from "vitest/config";

/**
 * Vitest config for apps/api (slice 3 batch 6 — T3.6 NestJS wrapper).
 *
 * Tests cover the NestJS e2e surface via
 * \`Test.createTestingModule(...)\` + supertest. The \`test/\` folder is
 * the canonical location; \`src/\` hosts the production code that the
 * tests exercise.
 */
export default defineConfig({
	test: {
		include: [
			"test/**/*.spec.ts",
			"test/**/*.test.ts",
			"test/**/*.e2e-spec.ts",
		],
		environment: "node",
		globals: false,
		clearMocks: true,
	},
});
