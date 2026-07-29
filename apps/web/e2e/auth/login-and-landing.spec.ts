import { test, expect } from "@playwright/test";

/**
 * Slice 7 PR-5 (T7.6) — login critical flow × 2 locales.
 *
 * Per tasks.md T7.6 + design §8.4: the canonical login critical flow is
 *   1. Navigate to `/[locale]/sign-in`.
 *   2. Fill the form with the canonical inputs (email + password).
 *   3. Submit.
 *   4. Assert the user lands on the locale-correct authenticated
 *      landing route (the dashboard at `/[locale]/`).
 *
 * Per design §8.4 the Playwright projects (`en` + `es`) handle the
 * locale split automatically; the test body is locale-agnostic.
 *
 * The test mocks the cross-origin auth API so the e2e does not
 * require a live `@features/auth` server. The mock returns the
 * minimal user shape the `SignInClient` consumes (per
 * `apps/web/components/auth/SignInClient.tsx`).
 *
 * Per-dev browser install: `npx playwright install chromium`.
 * Run via `pnpm e2e` from `apps/web/` (or `pnpm turbo run e2e`).
 */
const mockUserResponse = {
  id: "user-alice",
  email: "alice@example.com",
  role: "USER",
  sessionToken: "stub-session-token",
};

const mockLoginCookie = "auth-session=stub-session-token; Path=/; HttpOnly";

test.describe("T7.6 — login critical flow (both locales)", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the auth API (cross-origin POST to @features/auth).
    await page.route("**/auth/login", (route) => {
      // The dev server's proxied login endpoint would set the cookie;
      // the page reads the cookie via the Next.js auth-client
      // session lookup. Set the cookie in the mock so the
      // post-redirect route guard sees the session.
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockUserResponse),
        headers: {
          "content-type": "application/json",
          "set-cookie": mockLoginCookie,
        },
      });
    });
    // Mock the session lookup the (app) layout uses to render the
    // dashboard; it reads the cookie + calls /auth/session.
    await page.route("**/auth/session", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockUserResponse),
        headers: { "content-type": "application/json" },
      }),
    );
  });

  for (const locale of ["en", "es"] as const) {
    test(`clean session → sign-in form → submit → land on /${locale}/`, async ({ page }) => {
      // 1. Navigate to the locale's sign-in screen.
      await page.goto(`/${locale}/sign-in`);

      // 2. Fill the form. Field names are stable (the server reads
      //    email + password from the form data).
      await page.fill('input[name="email"]', "alice@example.com");
      await page.fill('input[name="password"]', "correct-horse-battery-staple");

      // 3. Submit.
      await Promise.all([
        page.waitForURL(`**/${locale}/`, { timeout: 5_000 }),
        page.click('button[type="submit"]'),
      ]);

      // 4. The dashboard renders the welcome copy for the active locale.
      //    The exact text is i18n-keyed so we just assert the URL + that
      //    the dashboard container rendered.
      // The locale is drawn from a hardcoded `["en", "es"]` literal in
      // this file — not user input — so the regex is a constant pattern
      // for the test runner. The slash-escape is for URL form only.
      const expectedPath = `/${locale}/`;
      expect(page.url()).toMatch(new RegExp(`${expectedPath.replace("/", "\\/")}$`));
      // The (app) group wraps the dashboard in a session-aware layout;
      // the dashboard surface is the user's landing experience.
      await expect(page.getByRole("main")).toBeVisible();
    });
  }
});
