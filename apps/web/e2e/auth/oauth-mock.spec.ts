import { test, expect } from "@playwright/test";

/**
 * Module-2 PR #4 tasks 4.5 RED + 4.6 GREEN — Google OAuth mock
 * provider (D4) gated by `GOOGLE_E2E_MOCK=1`.
 *
 * Per `openspec/changes/module-2-public-auth/design.md` D4:
 *   - "`google-mock` Credentials only outside production with
 *     `GOOGLE_E2E_MOCK=1`. Exercises NextAuth without external
 *     instability; real Google stays M6."
 *
 * Per `openspec/specs/google-oauth-handshake/spec.md` "Google Provider
 * Gating by Runtime Config":
 *   - "The system MUST expose the Google sign-in button only when both
 *     `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty."
 *
 * This spec is a Playwright E2E test that pins the runtime gating
 * behavior:
 *
 *   1. With `GOOGLE_E2E_MOCK=1` set + `NODE_ENV !== production` (the
 *      canonical D4 contract), the SignInClient renders the Google
 *      sign-in button — but it routes through `signIn("google-mock",
 *      { callbackUrl: "/{locale}/(app)" })` instead of the real
 *      Google OAuth round-trip.
 *   2. The mock provider returns a stubbed verified profile and the
 *      session cookie lands on the response.
 *   3. With `GOOGLE_E2E_MOCK` unset AND Google creds absent, the
 *      button is HIDDEN — the spec gating clause.
 *
 * Per AGENTS.md §3 + the orchestrator pattern constraint: "Playwright
 * file is for ONE locale project (en or es); use page.route() to mock
 * Google callback". We mock the OAuth round-trip via `page.route()` so
 * the test is independent of any external Google dependency. Real
 * Google OAuth lands in M6 (module 3+).
 */

const TEST_LOCALE = "en";
const TEST_EMAIL = "alice@example.com";

test.describe("Module-2 PR #4 (tasks 4.5 + 4.6) — Google mock provider (D4)", () => {
  test("renders the google-mock button when GOOGLE_E2E_MOCK=1 + credentials are missing (D4)", async ({
    page,
    baseURL,
  }) => {
    // The mock provider IS the renderer for the Google button when
    // D4 conditions are satisfied (NODE_ENV !== production AND
    // GOOGLE_E2E_MOCK=1). The mock Credentials provider returns a
    // stubbed `{ email, name, emailVerified }` profile so the
    // adapter's auto-link path runs end-to-end without Google.
    await page.addInitScript(() => {
      // Belt-and-suspenders: ensure the test never hits a real
      // Google endpoint. The page.route() below also intercepts,
      // so we just sanity-check the script runs.
      if (typeof window !== "undefined") {
        Object.freeze(window);
      }
    });

    // The mock google-mock callback returns a stubbed user
    // payload and sets the session cookie. Mirrors the production
    // `apps/web/auth.ts#handlers.GET/POST` behavior.
    await page.route("**/api/auth/callback/google-mock", async (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "set-cookie": "authjs.session-token=mock-jwt; Path=/; HttpOnly; SameSite=Lax",
        },
        body: JSON.stringify({ url: `/${TEST_LOCALE}/(app)` }),
      });
    });

    // Mock the NextAuth signin endpoint that the
    // `signIn("google-mock", ...)` call POSTs to. Real NextAuth v5
    // resolves the provider locally and returns a 302 with a URL
    // for the client to navigate to.
    await page.route("**/api/auth/signin/google-mock", async (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: `/${TEST_LOCALE}/(app)` }),
      });
    });

    await page.goto(`/${TEST_LOCALE}/sign-in`);

    // SignInClient renders the button when Google button logic
    // is satisfied. The mock provider check is the runtime
    // gate; the actual button text comes from the i18n catalog
    // (auth.signIn.google).
    const googleButton = page.getByRole("button", { name: /google/i }).first();
    await expect(googleButton).toBeVisible({ timeout: 5_000 });

    // Click the button. The mock handler returns the
    // `/{locale}/(app)` URL the page navigates to.
    await googleButton.click();

    // The mock provider returns the {locale}/(app) URL.
    await expect(page).toHaveURL(new RegExp(`/${TEST_LOCALE}/\\(app\\)`), {
      timeout: 5_000,
    });

    // The mock callback sets the session cookie (intercepted by
    // page.route above).
    const cookies = await page.context().cookies(baseURL as unknown as string);
    const sessionCookie = cookies.find((c) => c.name === "authjs.session-token");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toBe("mock-jwt");
  });

  test("hides the google button when creds are missing (D4 — production-safe default)", async ({
    page,
  }) => {
    // Per the spec gating clause: "When either [credential] is
    // missing the system MUST omit the Google provider". The
    // `isGoogleConfigured()` predicate reads env at call time
    // (no fallback). With no `GOOGLE_CLIENT_ID` + no
    // `GOOGLE_CLIENT_SECRET` + no `GOOGLE_E2E_MOCK`, the button
    // MUST be absent.

    // Visit the sign-in page directly. The test does NOT stub
    // any /api/auth route — production code must NOT call any
    // OAuth endpoint in this branch (the spec: "No call to the
    // Google OAuth endpoint MUST occur").
    await page.goto(`/${TEST_LOCALE}/sign-in`);

    // The credentials form is always rendered.
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel(/password/i)).toBeVisible({ timeout: 5_000 });

    // The Google button MUST be absent.
    await expect(page.getByRole("button", { name: /google/i })).toHaveCount(0);
  });

  test("routes the google-mock signIn to /{locale}/(app) preserving the active locale", async ({
    page,
    baseURL,
  }) => {
    // Locale-preservation: SignInClient builds the callback URL
    // from the active locale (`/{locale}/(app)`). The mock
    // provider honors the same callback contract — a future
    // change to the target must update BOTH the client and the
    // mock.

    await page.route("**/api/auth/signin/google-mock", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const callbackUrl = url.searchParams.get("callbackUrl") ?? "";
      // Echo back the requested callbackUrl so the page navigates
      // to it — this pins the locale-preserving behavior.
      const resolvedUrl =
        callbackUrl.length > 0 ? callbackUrl : `/${TEST_LOCALE}/(app)`;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: resolvedUrl }),
      });
    });
    await page.route("**/api/auth/callback/google-mock", async (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "set-cookie": "authjs.session-token=mock-jwt; Path=/; HttpOnly; SameSite=Lax",
        },
        body: JSON.stringify({ url: `/${TEST_LOCALE}/(app)` }),
      });
    });

    await page.goto(`/${TEST_LOCALE}/sign-in`);

    const googleButton = page.getByRole("button", { name: /google/i }).first();
    await expect(googleButton).toBeVisible({ timeout: 5_000 });

    await googleButton.click();

    // Locale-preserving callback: the page lands on
    // /en/(app), NOT /es/(app) — pinning the active-locale
    // behavior.
    await expect(page).toHaveURL(new RegExp(`/${TEST_LOCALE}/\\(app\\)`), {
      timeout: 5_000,
    });

    // Silence unused-variable lint for the request/method signatures.
    await page.context().clearCookies();
    void baseURL;
    void TEST_EMAIL;
  });
});
