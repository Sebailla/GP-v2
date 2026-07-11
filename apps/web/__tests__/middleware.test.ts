import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import middleware, { config } from "../middleware";

/**
 * TDD contract for `apps/web/middleware.ts` — slice 4 (T4.3).
 *
 * Per design §6.3 and design §4.4:
 *  - `locales: ['en', 'es']`, `defaultLocale: 'en'`,
 *    `localePrefix: 'always'`.
 *  - Bare `/sign-in` MUST redirect to `/en/sign-in` (the default
 *    locale prefix).
 *  - `/es/sign-in` MUST stay at `/es/sign-in` (no double-prefix).
 *  - `/api/...` MUST be excluded from the locale routing (Next.js
 *    API routes have their own surface).
 *  - `/sign-in/foo` (a deep prefixed path) MUST redirect to the
 *    canonical `/en/sign-in/foo`.
 *
 * The middleware is the default-exported function returned by
 * `createMiddleware(routing)`. Its signature is
 * `(request: NextRequest) => NextResponse | undefined`. We construct
 * a Web `Request` (Node 22+ has the standard fetch primitives
 * natively — `next/server`'s `NextRequest` extends `Request`) and
 * inspect the returned Response:
 *  - 30x redirect → read the Location header, decode it, and assert
 *    the path.
 *  - 200 passthrough → no Location header; assert that the request
 *    was processed (the middleware returns the language it
 *    detected via the \`x-next-intl-locale\` header, which is the
 *    canonical observable in next-intl 3.x).
 *
 * The test isolates the middleware function (no full Next.js test
 * harness) — middleware is a pure Request → Response transformer
 * with no React rendering, so we exercise the seam directly. The
 * matcher (the regex string exported alongside) is asserted on
 * separately because the matcher decides WHICH requests reach the
 * middleware; the middleware function itself decides what to do.
 */

const HOST = "http://localhost:3000";

async function callMiddleware(path: string): Promise<Response> {
  // The middleware is built against `NextRequest` (Next.js's Request
  // subclass with a Next.js-aware URL parser and the `nextUrl`
  // accessor that next-intl reads for locale-prefix detection).
  // Per Next.js's NextRequest constructor signature in
  // `next/dist/server/web/spec-extension/request.d.ts`, the input is a
  // `URL | RequestInfo` (a fully-qualified URL string is fine). The
  // `nextUrl` getter is populated from the URL's pathname by Next.js's
  // URL parser, which is what next-intl's middleware consults on
  // every request to decide whether to redirect.
  const request = new NextRequest(`${HOST}${path}`, { method: "GET" });
  const response = (await (
    middleware as unknown as (req: NextRequest) => Response | Promise<Response>
  )(request)) as Response;
  return response;
}

describe("apps/web/middleware.ts — locale routing (T4.3)", () => {
  it("redirects bare '/sign-in' to '/en/sign-in' (default locale prefix)", async () => {
    // Arrange — request to /sign-in with no locale prefix.
    // Act
    const response = await callMiddleware("/sign-in");

    // Assert: 30x redirect (3xx family) to /en/sign-in. The Location
    // header MAY be an absolute URL (next-intl 3.x default for
    // type:'default' redirects) — pin the path component only.
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    // Acceptable forms:
    //   "/en/sign-in"                        ← relative path
    //   "http://localhost:3000/en/sign-in"   ← absolute URL
    const locationPath = new URL(String(location), HOST).pathname;
    expect(locationPath).toBe("/en/sign-in");
  });

  it("keeps '/es/sign-in' unchanged (no double-prefix)", async () => {
    // Arrange — request with an explicit locale prefix.
    // Act
    const response = await callMiddleware("/es/sign-in");

    // Assert: 200 passthrough (the path is already locale-prefixed;
    // the middleware lets it through). The canonical observable for
    // "the middleware accepted this locale" is the
    // `x-middleware-request-x-next-intl-locale` header that next-intl
    // stamps on the response — next-intl 3.x publishes the active
    // locale this way (NOT via Vary, which next-intl does NOT set on
    // passthrough responses in 3.26.5 — only on redirect responses).
    expect(response.status).toBe(200);
    const activeLocale = response.headers.get("x-middleware-request-x-next-intl-locale");
    expect(activeLocale).toBe("es");

    // Cross-check: the NEXT_LOCALE cookie was stamped. This is the
    // cookie next-intl uses as the source-of-truth for subsequent
    // prefix-less requests, so an explicit `/es/sign-in` MUST set it.
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(String(setCookie)).toMatch(/NEXT_LOCALE=es/);
  });

  it("redirects a deep bare path (e.g. '/reset-password/foo') to the prefixed form", async () => {
    // Arrange — bare deep path that the (auth) route group will
    //        expose in slice 4 batch 4d.
    // Act
    const response = await callMiddleware("/reset-password/abc123");

    // Assert: redirected to /en/reset-password/abc123 (deep path
    // preserved, locale prefix prepended). Same path-only assertion
    // as the /sign-in case — Location may be absolute or relative.
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    const locationPath = new URL(String(location), HOST).pathname;
    expect(locationPath).toBe("/en/reset-password/abc123");
  });

  it("exposes the matcher exclusion list (api, _next, static files)", () => {
    // Assert: the module exports a `config` whose matcher is the
    // canonical next-intl v3 negative-lookahead form. This protects
    // against an accidental overwrite of the matcher that would
    // break the /api and /_next exclusion.
    expect(config).toBeDefined();
    const matcher = config.matcher;
    expect(matcher).toBeDefined();
    const matcherStr = Array.isArray(matcher) ? matcher.join("|") : String(matcher);
    expect(matcherStr).toMatch(/\(\?!.*api.*_next/);
    expect(matcherStr).toMatch(/\\/);
  });
});

describe("middleware exclusion — paths not seen by the middleware", () => {
  it("the matcher regex EXCLUDES /api/*", () => {
    // Pin the matcher form to the canonical negative-lookahead so a
    // future refactor that drops `api` from the exclusion (and would
    // therefore try to locale-prefix every API route) triggers this
    // assertion as a regression net.
    const matcher = config.matcher;
    const matcherStr = Array.isArray(matcher) ? matcher.join("|") : String(matcher);
    expect(matcherStr).toMatch(/\(\?![^)]*\bapi\b/);
  });

  it("the matcher regex EXCLUDES /_next/*", () => {
    // Same regression net as the /api/* exclusion.
    const matcher = config.matcher;
    const matcherStr = Array.isArray(matcher) ? matcher.join("|") : String(matcher);
    expect(matcherStr).toMatch(/\(\?![^)]*\b_next\b/);
  });
});
