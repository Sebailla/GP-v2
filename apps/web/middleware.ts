import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Web middleware (R-PF-3 + R-PF-2).
 *
 * `apps/web` ships a single middleware that:
 *   1. Delegates locale detection + locale-prefix redirects to
 *      next-intl's middleware factory (the canonical handler shipped
 *      by the next-intl package; the slice-4 middleware was
 *      `export default createMiddleware(routing)`).
 *   2. Layers the security headers required by R-PF-3
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
export default function middleware(
  request: NextRequest,
  _event: { waitUntil?: (p: Promise<unknown>) => void } = {},
): NextResponse {
  // next-intl's middleware signature is `(request: NextRequest) =>
  // NextResponse<unknown>`. The cast to `NextResponse | undefined` is
  // defensive: in production the middleware always returns a
  // NextResponse, but a future next-intl version may return undefined
  // for passthroughs and we want to fail safe with a bare 200.
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