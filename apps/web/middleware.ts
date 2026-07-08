import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n";

/**
 * next-intl v3 middleware — `apps/web` locale detector/redirector.
 *
 * Per design §6.3, every request is evaluated by `createMiddleware`
 * with the canonical routing config (the same object consumed by the
 * NextIntlClientProvider in the root layout, batch 4c+). The middleware:
 *
 *  1. Detects the active locale from the URL prefix → cookie →
 *     Accept-Language header (in that order).
 *  2. Redirects prefix-less paths to the prefixed form (e.g.
 *     `/sign-in` → `/en/sign-in`; visitor can re-route to `/es/...`
 *     via the locale switcher in batch 4b/c).
 *  3. Returns 200 (passthrough) when the active locale is already
 *     explicit in the URL (e.g. `/es/sign-in` stays as `/es/sign-in`).
 *
 * The matcher below excludes the routes that MUST NOT carry a locale
 * prefix:
 *  - `/api/...` — the Next.js API routes (none yet; reserved).
 *  - `/_next/...` — Next.js internals (RSC payloads, static assets).
 *  - Files with an extension (e.g. `.png`, `.svg`, `.css`) — static
 *    assets served from /public that the prefix rules must not touch.
 *
 * Any path that doesn't match the exclusion list is sent through the
 * middleware. This matches the next-intl v3 docs and the matcher in
 * `apps/web`'s Next.js boilerplate guidance.
 */
export default createMiddleware(routing);

export const config = {
  // Match every route EXCEPT the ones below. The trailing `(?!...)`
  // group is a negative lookahead that filters out `/api`, `/_next`,
  // and paths with a file extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
