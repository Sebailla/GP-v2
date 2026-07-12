import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Reusable accessibility-audit helper for slice 7 PR-6 (T7.8).
 *
 * Per design §11 + tasks.md T7.8, the slice 7 audit surface
 * (`apps/web/e2e/utils/axe.ts`) consolidates the WCAG AA assertion
 * shape that was repeated inline in slice 4's `wcag-aa.spec.ts`. Every
 * critical screen audit in slice 4-6 e2e suites routes through this
 * helper so the tag set, page scope, and assertion shape are fixed in
 * one place.
 *
 * WCAG tag set is locked to the slice-4 choice: `wcag2a`, `wcag2aa`,
 * `wcag21a`, `wcag21aa`. Extending the tag set is a future PR (it's a
 * product-level decision that needs product sign-off).
 *
 * Per dev browser install: `npx playwright install chromium`.
 */

/**
 * The locked tag set for the canonical WCAG AA audit.
 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/**
 * Run a WCAG AA audit on the current page state. Asserts (via
 * `expect`) that the violation array is empty.
 *
 * Usage (in a test body):
 * ```ts
 * import { test } from "@playwright/test";
 * import { expectNoAxeViolations } from "./utils/axe.js";
 *
 * test("...", async ({ page }) => {
 *   await page.goto("/en/sign-in");
 *   await expectNoAxeViolations(page);
 * });
 * ```
 *
 * The signature uses a `Page` (not a custom fixture) so the helper
 * composes freely with any `test.describe` / `test.beforeEach`
 * arrangement.
 */
export async function expectNoAxeViolations(
  page: Page,
  options?: {
    /** Override the locked WCAG tag set. Use only for focused diagnostics. */
    readonly tags?: ReadonlyArray<string>;
  },
): Promise<void> {
  const tags = options?.tags ?? WCAG_TAGS;
  const results = await new AxeBuilder({ page }).withTags([...tags]).analyze();
  expect(results.violations).toEqual([]);
}
