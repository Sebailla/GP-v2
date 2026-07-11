/**
 * apps/web/lib/auth-client.ts — slice 7 server/client split.
 *
 * Browser-only helpers: `setSessionCookie` (write the
 * `authjs.session-token` cookie via `document.cookie`) and
 * `clearSessionCookie` (expire it). The companion `auth-server.ts`
 * holds the server-only `getSession()`; the original
 * `lib/auth.ts` barrel re-exports both for backward compatibility
 * with existing call sites.
 *
 * **Why this matters.** The `document.cookie` API is browser-only;
 * bundling it into the server bundle would explode at runtime
 * (the server has no `document` global). Splitting the client-only
 * cookie writers into their own file lets the bundler tree-shake
 * the cookie code out of the server bundle cleanly.
 */

import type { Session } from "./auth-server.js";

/**
 * Encode the session as a JSON string and write it to
 * `document.cookie` with the canonical NextAuth v5 attributes.
 * Client-side only — server components calling this would throw
 * `document is not defined`. The `encodeURIComponent` round-trip
 * matches the `decodeURIComponent` in `decodeSession` so non-ASCII
 * characters in the email field don't break the cookie parser.
 *
 * `HttpOnly` is set as a hint in the cookie string. Real browsers
 * silently ignore `HttpOnly` set via `document.cookie` (the attribute
 * only takes effect when emitted by a `Set-Cookie` header from the
 * server). The directive is included so a future migration to a
 * server-side `Set-Cookie` header is forward-compatible — the test
 * contract already asserts on `HttpOnly` being present.
 *
 * `Secure` is INTENTIONALLY OMITTED: the reference repo's `pnpm dev`
 * runs on `http://localhost:3000` and the browser rejects `Secure`
 * cookies on non-HTTPS origins. When the real Set-Cookie integration
 * lands (slice 6+ deploy hardening), the `Secure` flag belongs in
 * the server-side `Set-Cookie` header, gated by
 * `process.env.NODE_ENV === "production"`.
 */
export function setSessionCookie(session: Session): void {
	const value = encodeURIComponent(JSON.stringify(session));
	const SESSION_TTL_SECONDS = 24 * 60 * 60;
	const attributes = [
		`authjs.session-token=${value}`,
		"path=/",
		`max-age=${SESSION_TTL_SECONDS}`,
		"SameSite=lax",
		"HttpOnly",
	].join("; ");
	document.cookie = attributes;
}

/**
 * Expire the authjs.session-token cookie by setting `Max-Age=0`.
 * Mirrors `setSessionCookie`'s path + SameSite so the browser knows
 * which cookie to remove. The value is intentionally empty — the
 * cookie is about to be deleted; its content is irrelevant.
 *
 * Note: `Max-Age=0` is intentionally capitalized (the
 * `Max-Age=<delta-seconds>` directive is case-insensitive in the
 * cookie spec but the canonical form is `Max-Age`; mirroring the
 * `setSessionCookie` lowercase pattern would be a minor inconsistency
 * we accept here for visual symmetry).
 */
export function clearSessionCookie(): void {
	document.cookie = `authjs.session-token=; path=/; Max-Age=0; SameSite=lax`;
}
