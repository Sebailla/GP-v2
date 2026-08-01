import { test, expect } from "@playwright/test";

import { buildMockSessionSetCookie } from "../utils/auth-mock-cookie.js";
import type { Session } from "../../lib/auth-shared.js";

/**
 * Module-2 PR #5 task 5.2 — vertical auth E2E for both locales (en + es).
 *
 * The canonical vertical scenario for module 2 (Phase 5):
 *
 *   1. Visit /{locale}/sign-in.
 *   2. Submit Credentials with the canonical email + password.
 *   3. Land on /{locale}/(app) with the session cookie active.
 *   4. Visit /{locale}/forgot-password.
 *   5. Submit the email — mock records the reset URL into the
 *      dev mailbox ring buffer (apps/web/app/api/dev/mailbox/route.ts).
 *   6. Visit /{locale}/dev/mailbox/{userId} and read the reset URL.
 *   7. Visit the reset URL.
 *   8. Submit the new password.
 *   9. Assert the authjs.session-token cookie is set (HttpOnly,
 *      SameSite=Lax) and the page lands back on /{locale}/(app).
 *
 * Per AGENTS.md §3 + the `pattern/playwright-per-project-webserver-not-supported`
 * constraint: the spec uses the `playwright per-project webServer`
 * configuration in `apps/web/playwright.config.ts` (the `en` and `es`
 * projects drive the locale split automatically).
 *
 * Per the brief: the Playwright e2e mocks the cross-origin auth API +
 * dev mailbox endpoint via `page.route()` so the test is independent
 * of a live web server. Real OAuth end-to-end lands in module 3 (M6).
 *
 * For the full-green execution prerequisite:
 *   npx playwright install chromium
 *   NODE_ENV=test pnpm dev
 * The `pnpm dev` invocation in the apply gate is not available; the
 * orchestrator runs the Playwright e2e suite separately after this
 * PR lands. The spec is the production-code contribution; execution
 * is documented in `Issues Found`.
 */

const TEST_USER_ID = "user-vertical-e2e-1";
const TEST_USER_EMAIL = "alice@example.com";
const TEST_NEW_PASSWORD = "NewP@ss456";

const TEST_LOCALES = ["en", "es"] as const;

for (const locale of TEST_LOCALES) {
  test.describe(`Module-2 PR #5 (task 5.2) — vertical auth flow [${locale}]`, () => {
    test(`completes sign-in → forgot → dev-mailbox → reset → land on /${locale}/(app)`, async ({
      page,
      baseURL,
    }) => {
      // Synthesize a raw reset token (real service uses
      // crypto.randomBytes(32).toString("hex") → 64 hex chars; the
      // reset-password schema accepts z.string().min(32).max(128)).
      const rawToken = "b".repeat(64);

      // Mock the cross-origin login endpoint. The page posts the
      // credentials form to /auth/login; the mock returns the
      // canonical user payload + sets the session cookie.
      await page.route(`**/${locale}/(auth)/sign-in`, async (route) => {
        // The browser-side navigation intercepts the /sign-in page
        // itself — let the page render normally (no override).
        route.continue();
      });

      await page.route(`**/auth/login`, async (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "set-cookie":
              "auth-session=login-jwt-stub; Path=/; HttpOnly; SameSite=Lax",
          },
          body: JSON.stringify({
            id: TEST_USER_ID,
            email: TEST_USER_EMAIL,
            role: "USER",
            sessionToken: "login-jwt-stub",
          }),
        });
      });

      // Mock the session lookup the (app) layout uses to gate auth.
      await page.route(`**/auth/session`, async (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: TEST_USER_ID,
            email: TEST_USER_EMAIL,
            role: "USER",
          }),
        });
      });

      // Mock the forgot-password endpoint. The seed event goes into
      // the WEB-side dev mailbox (apps/web/app/api/dev/mailbox/route.ts)
      // via the seed endpoint.
      await page.route(`**/auth/forgot-password`, async (route, request) => {
        const headers = request.headers();
        const acceptLanguage = headers["accept-language"] ?? "en";
        const detectedLocale = acceptLanguage.startsWith("es") ? "es" : "en";
        const resetUrl = `${baseURL}/${detectedLocale}/reset-password/${rawToken}`;
        await page.request.post(`${baseURL}/api/dev/mailbox/seed`, {
          data: {
            userId: TEST_USER_ID,
            token: rawToken,
            resetUrl,
            requestedAt: new Date().toISOString(),
          },
          failOnStatusCode: false,
        });
        route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      });

      // Mock the reset-password endpoint. D5 contract: returns 200 +
      // Set-Cookie authjs.session-token HttpOnly SameSite=Lax +
      // JSON body {redirectTo}.
      await page.route(`**/auth/reset-password`, async (route, request) => {
        const payload = JSON.parse(request.postData() ?? "{}") as {
          token?: string;
          newPassword?: string;
        };
        if (
          typeof payload.token !== "string" ||
          payload.token.length < 32 ||
          typeof payload.newPassword !== "string" ||
          payload.newPassword.length < 8
        ) {
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "VALIDATION_FAILED",
              message: "invalid input",
            }),
          });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            // v1.4.0: the reset-password route emits the canonical
            // URL-encoded JSON shape via `buildMockSessionSetCookie`
            // so the server's `decodeSession` reads the same value
            // the production API emits. Mirrors `auth.controller.ts
            // #resetPassword`'s Set-Cookie contract.
            "set-cookie": buildMockSessionSetCookie({
              user: { id: TEST_USER_ID, email: TEST_USER_EMAIL, role: "USER" },
              token: "post-reset-jwt-stub",
            } satisfies Session),
          },
          body: JSON.stringify({ redirectTo: `/${locale}/(app)` }),
        });
      });

      // 1. Visit the sign-in page.
      await page.goto(`/${locale}/sign-in`);

      // 2. Submit the credentials form. We use the i18n labels
      // (en/es) — the input names + locale-prefixed routes are
      // stable, the labels are translated per apps/web/messages/{en,es}.json.
      await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
      await page.getByLabel(/password/i).fill("correct-horse-battery-staple");
      await page
        .getByRole("button", { name: /sign in|iniciar sesi[oó]n/i })
        .first()
        .click();

      // 3. Land on the (app) dashboard.
      await expect(page).toHaveURL(new RegExp(`/${locale}/\\(app\\)`), {
        timeout: 5_000,
      });

      // 4. Visit the forgot-password page.
      await page.goto(`/${locale}/forgot-password`);

      // 5. Submit the email — the form transitions to success.
      await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
      await page
        .getByRole("button", { name: /send reset link|enviar enlace/i })
        .first()
        .click();
      await expect(page.getByTestId("forgot-password-success")).toBeVisible({
        timeout: 5_000,
      });

      // 6. Read the reset URL from the dev mailbox.
      await page.goto(`/${locale}/dev/mailbox/${TEST_USER_ID}`);
      const resetUrlAnchor = page.getByTestId("dev-mailbox-reset-url-0");
      await expect(resetUrlAnchor).toBeVisible({ timeout: 5_000 });
      const resetUrl =
        (await resetUrlAnchor.getAttribute("href")) ?? "";
      expect(resetUrl).toContain(`/${locale}/reset-password/`);
      expect(resetUrl).toContain(rawToken);

      // 7. Visit the reset URL.
      await page.goto(resetUrl);

      // 8. Submit the new password — the form transitions to success.
      const newPasswordInput = page.getByLabel(
        /new password|nueva contraseña/i,
      );
      await newPasswordInput.fill(TEST_NEW_PASSWORD);
      await page
        .getByRole("button", {
          name: /reset password|restablecer|restablecer contraseña/i,
        })
        .first()
        .click();

      // 9. Cookie set + redirect to /{locale}/(app).
      const cookies = await page.context().cookies(
        baseURL as unknown as string,
      );
      const sessionCookie = cookies.find(
        (c) => c.name === "authjs.session-token",
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.sameSite).toBe("Lax");
      await expect(page).toHaveURL(new RegExp(`/${locale}/\\(app\\)`), {
        timeout: 5_000,
      });
    });
  });
}
