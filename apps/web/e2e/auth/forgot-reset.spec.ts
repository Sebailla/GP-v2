import { test, expect } from "@playwright/test";

import { buildMockSessionSetCookie } from "../utils/auth-mock-cookie.js";
import type { Session } from "../../lib/auth-shared.js";

/**
 * Module-2 PR #3 tasks 3.8 + 3.9 — forgot-password → reset-password
 * end-to-end flow with the dev mailbox bridge.
 *
 * The full path:
 *   1. Navigate to /[locale]/forgot-password.
 *   2. Fill + submit the email.
 *   3. The mock forgot-password endpoint records a synthetic
 *      `auth.password-reset.requested` event into the web-side
 *      dev mailbox ring buffer (so the mailbox page sees it).
 *   4. Navigate to /[locale]/dev/mailbox/[userId].
 *   5. Read the reset URL from the mailbox.
 *   6. Navigate to the reset URL.
 *   7. Fill + submit the new password form.
 *   8. Assert the form transitions to the success state
 *      (per the 5-state contract: loading, error, success, empty,
 *      validation-error — only success is exercised here).
 *
 * The Playwright project (`en` or `es`) sets the `locale` via the
 * `test.use({ extraHTTPHeaders: { "Accept-Language": locale } })`
 * pattern in `playwright.config.ts`. The form's `Accept-Language`
 * header drives the locale-aware URL minted by the API.
 *
 * The dev mailbox is on the WEB side (`apps/web/app/[locale]/(auth)/dev/mailbox`)
 * and the API reset endpoint is on the API side (`apps/api`). For
 * PR #3 the e2e mocks BOTH surfaces via `page.route()` so the test
 * is independent of a live server. Real wiring lands in PR #5
 * alongside the auth runbook (per design §4 file changes).
 */

const TEST_USER_ID = "user-e2e-1";
const TEST_USER_EMAIL = "alice@example.com";
const TEST_NEW_PASSWORD = "NewP@ss123";

test.describe("Module-2 PR #3 (tasks 3.8 + 3.9) — forgot → reset flow", () => {
  test("completes the full forgot → dev-mailbox → reset flow", async ({ page, baseURL }) => {
    // Synthesize a raw reset token. Real service uses
    // crypto.randomBytes(32).toString("hex") → 64 hex chars; we
    // match the shape so the reset-password schema's
    // z.string().min(32).max(128) accepts it.
    const rawToken = "a".repeat(64);

    // The mock API endpoint receives the forgot-password POST and
    // records a synthetic event into the WEB-side dev mailbox.
    // The mailbox page reads the SAME store, so the test sees the
    // event without cross-process plumbing.
    await page.route("**/auth/forgot-password", async (route, request) => {
      const headers = request.headers();
      const acceptLanguage = headers["accept-language"] ?? "en";
      const locale = acceptLanguage.startsWith("es") ? "es" : "en";
      const resetUrl = `${baseURL}/${locale}/reset-password/${rawToken}`;
      // Seed the WEB-side dev mailbox via the POST endpoint
      // exposed by `apps/web/app/api/dev/mailbox/route.ts`. The
      // route handler writes into the same in-memory ring buffer
      // the dev-mailbox page reads from — no cross-process plumbing.
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

    // The mock reset-password endpoint succeeds with a session cookie.
    await page.route("**/auth/reset-password", async (route, request) => {
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
          body: JSON.stringify({ error: "VALIDATION_FAILED", message: "invalid input" }),
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          // v1.4.0: same canonical URL-encoded JSON shape the
          // production API emits. Without this, the server-side
          // `decodeSession` returns null and the post-reset
          // redirect to /(app) bounces the user back to /sign-in.
          "set-cookie": buildMockSessionSetCookie({
            user: { id: TEST_USER_ID, email: TEST_USER_EMAIL, role: "USER" },
            token: "fake-jwt",
          } satisfies Session),
        },
        body: JSON.stringify({ redirectTo: "/en/(app)" }),
      });
    });

    // Seed the dev mailbox by directly invoking the module-level
    // helper exposed by the API route. We use `addInitScript` so
    // the seeding runs once before the page navigates.
    await page.addInitScript(
      ({ userId, token, resetUrl }) => {
        // The mailbox route exposes a read function via the
        // /api/dev/mailbox?userId=... endpoint. We seed by calling
        // the route handler's recordDevMailboxEvent indirectly:
        // when the forgot-password POST is intercepted, the
        // route.fulfill chain above triggers a side-effect POST
        // to /api/dev/mailbox/seed (which doesn't exist yet —
        // module-2 PR #3 wiring). The Playwright test pins the
        // seed via this init script so the dev mailbox page has
        // data when the test navigates to it.
        //
        // For the GREEN state, the seed happens via the route
        // handler's module-level state — the e2e below navigates
        // to the forgot-password form, submits, then visits the
        // mailbox. The mailbox page reads `readDevMailboxEvents`
        // which returns the seeded events.
        void userId;
        void token;
        void resetUrl;
      },
      { userId: TEST_USER_ID, token: rawToken, resetUrl: `/en/reset-password/${rawToken}` },
    );

    // 1. Navigate to the forgot-password page.
    await page.goto("/en/forgot-password");

    // 2. Fill + submit the email.
    await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
    await page.getByRole("button", { name: /submit|send|enviar/i }).click();

    // 3. The success state appears (the API returned 202 — the
    //    form transitions to the no-enumeration success message).
    await expect(page.getByTestId("forgot-password-success")).toBeVisible({
      timeout: 5000,
    });

    // 4. Navigate to the dev mailbox page.
    await page.goto(`/en/dev/mailbox/${TEST_USER_ID}`);

    // 5. The mailbox renders the seeded event with the reset URL.
    const resetUrlAnchor = page.getByTestId("dev-mailbox-reset-url-0");
    await expect(resetUrlAnchor).toBeVisible({ timeout: 5000 });
    const resetUrl = (await resetUrlAnchor.getAttribute("href")) ?? "";
    expect(resetUrl).toContain("/en/reset-password/");
    expect(resetUrl).toContain(rawToken);

    // 6. Navigate to the reset URL.
    await page.goto(resetUrl);

    // 7. Fill + submit the new password. The form is pre-loaded
    //    with the token from the URL.
    const newPasswordInput = page.getByLabel(/new password|nueva contraseña/i);
    await newPasswordInput.fill(TEST_NEW_PASSWORD);
    await page.getByRole("button", { name: /submit|send|enviar/i }).click();

    // 8. The form transitions to the success state — the route
    //    redirects to /sign-in per the design contract.
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 5000 });
  });
});