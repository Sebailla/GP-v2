import type { Page, BrowserContext } from "@playwright/test";

/**
 * Reusable auth-cookie harness for the apps/web e2e suite.
 *
 * **Why this module exists** (SUGGESTION-S2 closure, 2026-07-31):
 *
 * The apps/web e2e specs that exercise authenticated surfaces
 * (`wcag-aa.spec.ts`, `login-and-landing.spec.ts`,
 * `login-list-create.spec.ts`, and historically
 * `auth/vertical-auth.spec.ts` pre-fix) all need a session cookie
 * that satisfies the server-side `decodeSession` in
 * `apps/web/lib/auth-server.ts`. The server does:
 *
 *   JSON.parse(decodeURIComponent(raw))
 *
 * and validates the shape `{ user: { id, email, role }, token }` —
 * it does NOT use a real JWT signature verification (the slice-2
 * dev-mode session is a plain signed payload, not a real
 * NextAuth JWT). The early slice-4 e2e specs set the cookie via
 * `set-cookie: auth-session=stub-session-token; Path=/; HttpOnly`
 * on `page.route().fulfill()`. That works for some specs (where
 * the test doesn't depend on the (app) layout's session guard)
 * but fails for any spec that navigates to an (app)-grouped
 * route because the cookie is named `auth-session` while the
 * server reads `authjs.session-token` (per
 * `AUTH_SESSION_COOKIE` in `auth-server.ts`).
 *
 * This module provides a single source of truth for the auth-cookie
 * pattern. Use `setSessionCookie(context, user)` BEFORE the first
 * `page.goto()` so the (app) layout's `getSession()` reads the
 * session from the very first request. The pattern matches the
 * pre-existing `auth/vertical-auth.spec.ts` workflow but
 * abstracts the cookie shape so the JSON encoding + URL encoding
 * + cookie name live in one place.
 *
 * **Pre-existing out-of-scope issues** (kept in this file as
 * documentation so future readers know not to re-discover them):
 *
 * 1. The dev mailbox (apps/web/app/api/dev/mailbox/route.ts) is
 *    a process-local Map. The e2e dev server (`pnpm dev`) is a
 *    separate process from the test runner, so the seed POST from
 *    the test (via `page.request.post`) lands on the dev server's
 *    Map but the read GET also lands on the dev server's Map. They
 *    are the SAME process for a single `pnpm dev` invocation, so
 *    the seed/read works in CI; local runs work too. The
 *    `vertical-auth.spec.ts` flow uses this pattern.
 * 2. The `wcag-aa.spec.ts` audit surfaces still find `document-
 *    title` violations on auth pages that lack a `<title>`
 *    element. Fixed in v1.3.0 (commit `fcb4756`).
 * 3. The `transactions/login-list-create.spec.ts` `waitForURL`
 *    was hardcoded to `/${locale}/`; the post-auth callback
 *    actually lands on `/${locale}/(app)` (Next.js route group,
 *    not a real path). The new `waitForAuthenticatedLanding()`
 *    helper uses a regex that matches both shapes for
 *    backward-compatibility with specs that may still use the old
 *    hardcoded path.
 */

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly role: "USER" | "ADMIN" | "SUPERADMIN";
}

/**
 * Encode a session payload the way `apps/web/lib/auth-server.ts`
 * expects on the `authjs.session-token` cookie:
 *
 *   JSON.parse(decodeURIComponent(raw))
 *
 * The value written to the cookie jar must be the already-encoded
 * string; Chromium passes the cookie value verbatim to the server
 * (no extra encoding), and the server's `decodeURIComponent`
 * un-encodes it before `JSON.parse`.
 */
function encodeSessionCookieValue(user: SessionUser, token: string): string {
  return encodeURIComponent(
    JSON.stringify({
      user: { id: user.id, email: user.email, role: user.role },
      token,
    }),
  );
}

/**
 * Set the `authjs.session-token` cookie on the browser context
 * BEFORE any navigation. The (app) layout's `getSession()` reads
 * this cookie on every request; pre-seeding it avoids the
 * redirect-to-/sign-in race that plagued the slice-4 e2e specs.
 */
export async function setSessionCookie(
  context: BrowserContext,
  user: SessionUser,
  token = "stub-session-token",
): Promise<void> {
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: encodeSessionCookieValue(user, token),
      url: "http://localhost:3000",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Mock the cross-origin auth API the apps/web client calls.
 *
 * - `POST /auth/login` — the sign-in form posts here. Returns
 *   the canonical user payload + the session token. The client
 *   stores the token in the `authjs.session-token` cookie via
 *   the `setSessionCookie` browser helper on the JS side.
 * - `GET /auth/session` — the (app) layout's server-side
 *   `getSession()` issues a fetch to this endpoint as part of
 *   the post-auth session refresh. Returning the same user shape
 *   keeps the layout in the authenticated state.
 *
 * Note: the mock does NOT set a `set-cookie` header because
 * the page cookie is pre-seeded by `setSessionCookie` BEFORE
 * any navigation. Setting it here would double-set; Chromium
 * already drops cookies with `HttpOnly` set on `page.route`
 *   responses because the response is fulfilled after the
 *   navigation has already started.
 */
export async function mockAuthApi(
  page: Page,
  user: SessionUser,
  options: { token?: string } = {},
): Promise<void> {
  const token = options.token ?? "stub-session-token";
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    sessionToken: token,
  };
  await page.route("**/auth/login", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    }),
  );
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        role: user.role,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
}

/**
 * Default test user for the apps/web e2e suite. Matches the
 * canonical mock used by `login-and-landing.spec.ts` and
 * `transactions/login-list-create.spec.ts`.
 */
export const TEST_USER: SessionUser = {
  id: "user-alice",
  email: "alice@example.com",
  role: "USER",
};

/**
 * Wait for the post-auth landing route. The callbackUrl post-signin
 * is `/${locale}/(app)` (the (app) route group, the canonical
 * authenticated landing per the design). The parens are NOT a
 * URL segment in Next.js 16 — Next.js resolves the path
 * `/(app)/...` to the (app) group's pages without rendering the
 * parens in the browser URL. The match here is on the trailing
 * `/(app)` substring of the pathname.
 */
export async function waitForAuthenticatedLanding(
  page: Page,
  locale: "en" | "es",
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5_000;
  // The browser URL will end with `/(app)` after the (app)
  // group is resolved. We also accept the root `/<locale>/` (no
  // (app) suffix) for backward compat with the slice-1 fallback
  // path that some legacy specs may still use.
  await page.waitForURL(new RegExp(`/${locale}(/(\\(app\\))?)?$`), { timeout });
}
