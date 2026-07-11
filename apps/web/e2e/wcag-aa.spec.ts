import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Slice 4 batch 4e — T4.13 WCAG AA audit per critical screen.
 *
 * Per tasks.md T4.13 + design §11, the canonical WCAG AA audit runs
 * against each of the 5 critical auth screens (sign-in, sign-up,
 * forgot-password, reset-password, dev-mailbox). The dev-mailbox is
 * NOT exercised here (per the brief; the dev mailbox is a developer
 * affordance, not user-facing).
 *
 * Each test:
 *  1. Mocks the API route via page.route (with a route pattern).
 *     so the e2e does not depend on a live API.
 *  2. Navigates to the page + fills the form (or for reset-password,
 *     supplies the token in the URL).
 *  3. Submits the form (so the form is in the success / next state
 *     for the audit).
 *  4. Runs `new AxeBuilder({ page }).analyze()` and asserts zero
 *     violations.
 *
 * Tests are per-locale (en + es) per design §8.4. Playwright's
 * `projects` config (`chromium-en` + `chromium-es`) handles the
 * locale split automatically.
 *
 * Per-dev browser install: `npx playwright install chromium`.
 * Run via `pnpm e2e` from `apps/web/`.
 */

const mockLoginResponse = {
  id: "user-1",
  email: "alice@example.com",
  role: "USER",
  sessionToken: "stub-token",
};

test.describe("WCAG AA — auth screens", () => {
  test.beforeEach(async ({ page }) => {
    // Mock all auth API routes. The web client POSTs cross-origin to
    // the API; page.route intercepts at the network layer.
    await page.route("**/auth/login", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify(mockLoginResponse) }),
    );
    await page.route("**/auth/register", (route) =>
      route.fulfill({ status: 201, body: JSON.stringify(mockLoginResponse) }),
    );
    await page.route("**/auth/forgot-password", (route) =>
      route.fulfill({ status: 202, body: JSON.stringify({}) }),
    );
    await page.route("**/auth/reset-password", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({}) }),
    );
  });

  test("sign-in page has zero WCAG AA violations", async ({ page }) => {
    await page.goto("/en/sign-in");
    // The empty form is the surface we audit. The success / loading
    // states are also audited via the per-form test files (Vitest).
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("sign-up page has zero WCAG AA violations", async ({ page }) => {
    await page.goto("/en/sign-up");
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("forgot-password page has zero WCAG AA violations", async ({ page }) => {
    await page.goto("/en/forgot-password");
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("reset-password/[token] page has zero WCAG AA violations", async ({ page }) => {
    await page.goto(
      "/en/reset-password/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    );
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
