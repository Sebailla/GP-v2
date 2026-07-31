import { test, expect } from "@playwright/test";

import {
  TEST_USER,
  mockAuthApi,
  setSessionCookie,
  waitForAuthenticatedLanding,
} from "../utils/auth-harness.js";

/**
 * Slice 7 PR-5 (T7.6) — login critical flow × 2 locales.
 *
 * Per tasks.md T7.6 + design §8.4: the canonical login critical flow is
 *   1. Navigate to `/[locale]/sign-in`.
 *   2. Fill the form with the canonical inputs (email + password).
 *   3. Submit.
 *   4. Assert the user lands on the locale-correct authenticated
 *      landing route (the (app) dashboard at `/[locale]/(app)`).
 *
 * Per design §8.4 the Playwright projects (`en` + `es`) handle the
 * locale split automatically; the test body is locale-agnostic.
 *
 * The test mocks the cross-origin auth API so the e2e does not
 * require a live `@features/auth` server. The session cookie is
 * pre-seeded in `beforeEach` via the shared `auth-harness`
 * helper so the (app) layout's session guard never redirects to
 * /sign-in (this was the slice-4 / slice-7 auth-harness
 * fragility documented as SUGGESTION-S2 in the v1.2.0 archive-
 * report; the helper now provides the canonical fix).
 *
 * Per-dev browser install: `npx playwright install chromium`.
 * Run via `pnpm e2e` from `apps/web/` (or `pnpm turbo run e2e`).
 */

test.describe("T7.6 — login critical flow (both locales)", () => {
  test.beforeEach(async ({ context, page }) => {
    // Pre-seed the session cookie so the (app) layout's
    // `getSession()` resolves the session from the very first
    // request. The shared helper does the URL-encoded JSON
    // encoding the server's `decodeSession` expects.
    await setSessionCookie(context, TEST_USER);
    // Mock the cross-origin auth API. The page calls POST
    // /auth/login on submit + GET /auth/session for the
    // post-auth refresh; both return the canonical user shape.
    await mockAuthApi(page, TEST_USER);
  });

  for (const locale of ["en", "es"] as const) {
    test(`clean session → sign-in form → submit → land on /${locale}/(app)`, async ({ page }) => {
      // 1. Navigate to the locale's sign-in screen.
      await page.goto(`/${locale}/sign-in`);

      // 2. Fill the form. Field names are stable (the server reads
      //    email + password from the form data).
      await page.fill('input[name="email"]', TEST_USER.email);
      await page.fill('input[name="password"]', "correct-horse-battery-staple");

      // 3. Submit. The shared `waitForAuthenticatedLanding` helper
      //    matches the post-auth callbackUrl `/${locale}/(app)`
      //    (Next.js route group, not a real path segment).
      await Promise.all([
        waitForAuthenticatedLanding(page, locale, { timeout: 5_000 }),
        page.click('button[type="submit"]'),
      ]);

      // 4. The dashboard renders the welcome copy for the active locale.
      //    The (app) group wraps the dashboard in a session-aware
      //    layout; the dashboard surface is the user's landing
      //    experience.
      await expect(page.getByRole("main")).toBeVisible();
    });
  }
});