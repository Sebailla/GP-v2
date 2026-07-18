import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import middleware, { config } from "../middleware";

/**
 * TDD contract for `apps/web/middleware.ts` admin guard — module-3
 * Phase 4 (PR #4, tasks 4.1 + 4.2).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §2 D1 +
 * `openspec/specs/nextauth-web-routes/spec.md` (Admin Route Guard
 * requirement) + `tasks.md` 4.1-4.2:
 *
 *  - All routes under `/[locale]/(app)/admin/*` MUST be guarded by
 *    `role=ADMIN` server-side AND client-side (middleware).
 *  - Unauthenticated user → redirect to `/{locale}/sign-in`.
 *  - Authenticated non-admin → redirect to `/{locale}/(app)` with a
 *    localized flash query param `?admin=denied`.
 *  - Authenticated admin → continue (200 passthrough with the
 *    admin locale prefix preserved).
 *
 * Per AGENTS.md §9 the response MUST include a localized flash
 * surface (`admin.flash.denied` in en/es catalogs). The middleware
 * encodes it as `?admin=denied` so the receiving page can render
 * the localized copy without the middleware having to render JSX.
 *
 * The cookie is the same `authjs.session-token` cookie the
 * (app) layout reads (`apps/web/lib/auth-server.ts`). The
 * middleware decodes it via the shared `decodeSession()` pure
 * function (re-used, not re-implemented). When `auth().user.role`
 * is the design surface; on the web middleware we read the same
 * cookie and compare `user.role === 'ADMIN'`.
 *
 * The test exercises three personas by setting the cookie value
 * directly (a JSON-encoded `Session` per the auth-client contract):
 *  - No cookie → unauthenticated → redirect to sign-in.
 *  - `role: 'USER'` cookie → non-admin → redirect to (app).
 *  - `role: 'ADMIN'` cookie → continue with the admin path.
 */

const HOST = "http://localhost:3000";

function adminCookieValue(role: "USER" | "ADMIN" | "NONE"): string | undefined {
  if (role === "NONE") return undefined;
  const payload = JSON.stringify({
    token: "session-token-stub",
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: `${role.toLowerCase()}@example.com`,
      role,
    },
  });
  return encodeURIComponent(payload);
}

async function callMiddleware(path: string, cookieValue: string | undefined): Promise<Response> {
  const request = new NextRequest(`${HOST}${path}`, { method: "GET" });
  if (cookieValue !== undefined) {
    // The middleware reads the cookie via `cookies().get(NAME)?.value`
    // — happy-dom does NOT provide a Request cookie store for
    // NextRequest, so we attach the cookie to the underlying
    // Headers bag directly. Next.js's NextRequest forwards the
    // `cookie` header to the middleware's `cookies()` accessor.
    request.headers.set("cookie", `authjs.session-token=${cookieValue}`);
  }
  const response = (await (
    middleware as unknown as (req: NextRequest) => Response | Promise<Response>
  )(request)) as Response;
  return response;
}

function locationPath(response: Response): string {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  return new URL(String(location), HOST).pathname;
}

describe("apps/web/middleware.ts — admin route guard (M3 Phase 4)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects an unauthenticated user on /en/admin/users to /en/sign-in", async () => {
    // Arrange: no cookie (cookieValue === undefined).
    // Act
    const response = await callMiddleware("/en/admin/users", undefined);

    // Assert: redirect to /en/sign-in (preserves the locale).
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(locationPath(response)).toBe("/en/sign-in");
  });

  it("redirects an unauthenticated user on /es/admin/sessions to /es/sign-in", async () => {
    // Same as above but for the Spanish locale — the redirect
    // MUST preserve the active locale, not collapse to /en/...
    const response = await callMiddleware("/es/admin/sessions", undefined);
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(locationPath(response)).toBe("/es/sign-in");
  });

  it("redirects an authenticated non-admin on /en/admin/users to /en/(app) with denied flash", async () => {
    // Arrange: USER cookie.
    // Act
    const response = await callMiddleware(
      "/en/admin/users",
      adminCookieValue("USER"),
    );

    // Assert: redirect to /en/(app) with ?admin=denied flash
    // (the page reads the flash and renders the localized copy).
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    const url = new URL(String(location), HOST);
    expect(url.pathname).toBe("/en/(app)");
    expect(url.searchParams.get("admin")).toBe("denied");
  });

  it("redirects a non-admin on /es/admin/users to /es/(app) (locale preserved)", async () => {
    // Same as above for the es locale — proves locale preservation.
    const response = await callMiddleware(
      "/es/admin/users",
      adminCookieValue("USER"),
    );
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const url = new URL(String(response.headers.get("location")), HOST);
    expect(url.pathname).toBe("/es/(app)");
    expect(url.searchParams.get("admin")).toBe("denied");
  });

  it("lets an authenticated admin through /en/admin/users (200 passthrough)", async () => {
    // Arrange: ADMIN cookie.
    // Act
    const response = await callMiddleware(
      "/en/admin/users",
      adminCookieValue("ADMIN"),
    );

    // Assert: 200 passthrough (the request continues to the page
    // handler; the layout's own session guard is the next layer).
    expect(response.status).toBe(200);
  });

  it("lets an authenticated admin through /en/admin/users/<id> (dynamic detail page)", async () => {
    // Per spec scenario 'Admin visits dynamic detail': the guard
    // applies to BOTH the list page AND the dynamic detail page.
    const response = await callMiddleware(
      "/en/admin/users/11111111-1111-4111-8111-111111111111",
      adminCookieValue("ADMIN"),
    );
    expect(response.status).toBe(200);
  });

  it("does NOT redirect /en/(app) for an authenticated admin (only /admin/* is guarded)", async () => {
    // Regression net: the middleware MUST scope the admin guard
    // to /admin/* — a stray path.startsWith('admin') would break
    // the rest of the (app) surface.
    const response = await callMiddleware(
      "/en/transactions",
      adminCookieValue("USER"),
    );
    expect(response.status).toBe(200);
  });

  it("does NOT redirect /en/sign-in for an unauthenticated visitor (the sign-in guard is the layout's job)", async () => {
    // Regression net: the admin guard fires only for /admin/*;
    // the bare sign-in surface continues to be a 200 so the
    // sign-in page renders (the (auth) layout's own guard decides).
    const response = await callMiddleware("/en/sign-in", undefined);
    expect(response.status).toBe(200);
  });
});

describe("apps/web/middleware.ts — admin matcher still excludes /api", () => {
  it("the matcher regex continues to exclude /api/* after the admin guard lands", () => {
    // Regression net for AGENTS.md §7: the API surface is
    // NOT locale-prefixed by next-intl. Adding a /admin/* pre-check
    // MUST NOT silently widen the matcher.
    const matcher = config.matcher;
    const matcherStr = Array.isArray(matcher) ? matcher.join("|") : String(matcher);
    expect(matcherStr).toMatch(/\(\?![^)]*\bapi\b/);
  });
});
