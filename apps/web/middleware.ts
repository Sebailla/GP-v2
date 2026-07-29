import { decode } from "next-auth/jwt";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Web middleware (R-PF-3 + R-PF-2 + M3 admin guard).
 *
 * `apps/web` ships a single middleware that:
 *   1. For `/[locale]/admin/*` requests, runs the M3 admin route
 *      guard (per `openspec/changes/module-3-superadmin/design.md`
 *      D1 + `openspec/specs/nextauth-web-routes/spec.md` Admin
 *      Route Guard requirement):
 *        - no session cookie              → 30x redirect to `/{locale}/sign-in`
 *        - session.role !== 'ADMIN'       → 30x redirect to `/{locale}/(app)`
 *                                           with `?admin=denied` flash
 *        - session.role === 'ADMIN'       → passthrough (the (app)
 *                                           layout's session guard is
 *                                           the next layer)
 *   2. Delegates locale detection + locale-prefix redirects to
 *      next-intl's middleware factory (the canonical handler shipped
 *      by the next-intl package).
 *   3. Layers the security headers required by R-PF-3
 *      (X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
 *      and Strict-Transport-Security when NODE_ENV !== "development")
 *      on every response the matcher lets through.
 *
 * The matcher excludes `/api`, `/_next`, `/_vercel`, and files with a
 * file extension — so the API surface and Next.js internals stay
 * unaffected, and the proxy's own caching headers (notably
 * `Cache-Control: no-store` on `/api/status`) remain authoritative
 * for the status page.
 *
 * Implementation note: we mutate the intl response's headers in place
 * rather than cloning them. The `Response` constructor's `init.headers`
 * parameter silently drops `set-cookie` entries per the WHATWG Fetch
 * spec — but the intl middleware sets cookies via `response.cookies.
 * set(...)`, which writes directly to the response's mutable
 * `Headers` via `headers.append`. Rebuilding the response would lose
 * those cookies; layering the security headers on the existing
 * NextResponse preserves them.
 *
 * Headers added to every middleware response:
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - X-Frame-Options: DENY
 *   - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
 *     (only when NODE_ENV !== "development")
 */

const AUTH_SESSION_COOKIE = "authjs.session-token";

/**
 * Shape of the persisted `Session` cookie value (matches
 * `apps/web/lib/auth-server.ts#Session`). The middleware decodes
 * the cookie value with the same `decodeSession` pure function the
 * server uses so the role check is the canonical contract.
 *
 * Kept inline (not imported from `@/lib/auth-server`) because
 * `auth-server.ts` imports `server-only` which throws at module
 * load when the middleware bundle is evaluated in the Node test
 * runner — see `apps/web/vitest.config.ts` for the `server-only`
 * empty-shim alias (alias only available inside the vitest config,
 * not at middleware import time).
 */
type AdminCookieSession = {
  readonly token: string;
  readonly user: { readonly id: string; readonly email: string; readonly role: string };
};

type AdminJwtClaims = {
  readonly userId?: unknown;
  readonly sub?: unknown;
  readonly email?: unknown;
  readonly role?: unknown;
};

async function decodeAdminSession(raw: string | undefined): Promise<AdminCookieSession | null> {
  if (raw === undefined || raw === "") return null;
  try {
    const claims = (await decode({
      token: decodeURIComponent(raw),
      secret: process.env["NEXTAUTH_SECRET"] ?? process.env["JWT_SECRET"] ?? "",
      salt: AUTH_SESSION_COOKIE,
    })) as AdminJwtClaims | null;
    if (claims === null) return null;
    const id = typeof claims.userId === "string" ? claims.userId : claims.sub;
    if (
      typeof id !== "string" ||
      typeof claims.email !== "string" ||
      typeof claims.role !== "string"
    ) {
      return null;
    }
    return {
      token: raw,
      user: { id, email: claims.email, role: claims.role },
    };
  } catch {
    return null;
  }
}

/**
 * Determine whether the request path is an admin route for the
 * given locale. Returns `true` for `/en/admin`, `/en/admin/`,
 * `/en/admin/users`, `/en/admin/users/<id>`, etc.
 *
 * The check is segment-aware: it matches `/admin` as a full
 * path segment AFTER the locale prefix so a future locale of
 * `/administration/...` does not accidentally trip the guard.
 */
function isAdminPath(locale: string, pathname: string): boolean {
  // pathname is e.g. '/en/admin/users' or '/en/admin/users/<id>'
  const prefix = `/${locale}/admin`;
  if (pathname === prefix) return true;
  if (pathname.startsWith(`${prefix}/`)) return true;
  return false;
}

/**
 * Read a cookie value from a `Cookie` header string. The canonical
 * WHATWG cookie parser. Used as a fallback when `request.cookies`
 * is unavailable (e.g. in test environments where NextRequest's
 * cookie parser is partially initialized). In production,
 * `request.cookies.get(NAME)?.value` is preferred.
 */
function readCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null || cookieHeader === "") return undefined;
  // Split on `; ` (cookie pairs are separated by `; ` in the
  // request's `Cookie` header). Per RFC 6265 §5.4 the cookie
  // header is `name=value; name2=value2` — semicolon + space.
  const pairs = cookieHeader.split("; ");
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    if (key !== name) continue;
    return pair.slice(eq + 1);
  }
  return undefined;
}

/**
 * Apply the M3 admin route guard. Called from the middleware
 * function for paths under `/[locale]/admin/*`. Returns the
 * response to emit — either a `NextResponse.redirect` for
 * unauthenticated / non-admin requests, or `null` to signal
 * "no guard action, continue with the normal middleware flow".
 */
async function adminGuard(request: NextRequest, pathname: string): Promise<NextResponse | null> {
  // The matcher filters by locale prefix so we extract the
  // locale from the first segment (defensive — middleware order
  // with next-intl's locale routing guarantees this).
  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0] ?? routing.defaultLocale;
  if (!isAdminPath(locale, pathname)) return null;

  // Read the cookie. Prefer `request.cookies.get(...)` (the
  // canonical Next.js API in production) but fall back to the
  // raw `Cookie` header so the test harness — which sets the
  // header directly on `NextRequest.headers` — sees the same
  // value as production. NextRequest's cookie store is
  // initialized lazily from the header on first access; reading
  // it explicitly via the header avoids any lazy-init races.
  const cookieHeader = request.headers.get("cookie");
  const raw = readCookieFromHeader(cookieHeader, AUTH_SESSION_COOKIE);
  const session = await decodeAdminSession(raw);
  if (session === null) {
    // No session at all → kick to sign-in for the active locale.
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
  }
  if (session.user.role !== "ADMIN") {
    // Authenticated but not an admin → kick to (app) landing
    // with the `?admin=denied` flash so the receiving page can
    // render the localized copy without the middleware having
    // to render JSX.
    const target = new URL(`/${locale}/(app)`, request.url);
    target.searchParams.set("admin", "denied");
    return NextResponse.redirect(target);
  }
  // Admin → continue. The (app) layout's session guard is the
  // next layer (defense in depth).
  return null;
}

export default async function middleware(
  request: NextRequest,
  _event: { waitUntil?: (p: Promise<unknown>) => void } = {},
): Promise<NextResponse> {
  // 1. Admin guard (M3 Phase 4). Run BEFORE the intl middleware
  //    so the redirect's locale segment is the canonical one
  //    (the intl middleware may rewrite the pathname to a
  //    locale-prefixed form, but for `/[locale]/admin/*` requests
  //    the locale segment is already present).
  const guard = await adminGuard(request, request.nextUrl.pathname);
  if (guard !== null) {
    // Layer the security headers on the guard response too so a
    // 30x redirect still ships nosniff + frame-options.
    guard.headers.set("X-Content-Type-Options", "nosniff");
    guard.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    guard.headers.set("X-Frame-Options", "DENY");
    if (process.env["NODE_ENV"] !== "development") {
      guard.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }
    return guard;
  }

  // 2. next-intl's middleware signature is `(request: NextRequest) =>
  //    NextResponse<unknown>`. The cast to `NextResponse | undefined` is
  //    defensive: in production the middleware always returns a
  //    NextResponse, but a future next-intl version may return undefined
  //    for passthroughs and we want to fail safe with a bare 200.
  const intlRes = intlMiddleware(request) as NextResponse | undefined;

  const response: NextResponse =
    intlRes ?? new NextResponse(undefined, { status: 200 });

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  if (process.env["NODE_ENV"] !== "development") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export const config = {
  // Match every route EXCEPT the ones below. The trailing `(?!...)`
  // group is a negative lookahead that filters out `/api`, `/_next`,
  // `/_vercel`, and paths with a file extension. This is the same
  // matcher the slice-4 middleware used; the value is unchanged so
  // existing locale-routing behavior is preserved.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};