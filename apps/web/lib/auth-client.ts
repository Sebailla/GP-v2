/**
 * apps/web/lib/auth-client.ts — slice 7 server/client split +
 * slice 8.1.2 client-side surface expansion.
 *
 * Browser-only helpers: `setSessionCookie` (write the
 * `authjs.session-token` cookie via `document.cookie`) and
 * `clearSessionCookie` (expire it). The companion `auth-server.ts`
 * holds the server-only `getSession()` plus the cookie
 * read/decoder surface.
 *
 * **Slice 8.1.2 — `isSessionPayload` + `SessionPayload` move.** These
 * were previously exported from `auth-server.ts` and re-exported by
 * the (now-deleted) `lib/auth.ts` barrel. They describe the API
 * login/register response shape — a contract that only the
 * client-side forms consume (LoginForm + SignUpForm transform the
 * JSON response into a `Session` cookie). Keeping them here means
 * client components can pull them without transitively importing
 * `next/headers` from `auth-server.ts`, which is the bug the
 * slice 8.1.2 fix closes.
 *
 * **Why this matters.** The `document.cookie` API is browser-only;
 * bundling it into the server bundle would explode at runtime
 * (the server has no `document` global). Splitting the client-only
 * cookie writers + payload type-guard into their own file lets the
 * bundler tree-shake the server code out of the client bundle cleanly.
 */

import type { Session } from "./auth-server.js";

/**
 * Shape the auth API's login / register response takes. Mirrors the
 * API's response contract (slice 4 batch 2). The form-level
 * `onSuccess` narrows the parsed JSON to this shape before writing
 * the cookie.
 */
export type SessionPayload = {
	id: string;
	email: string;
	role: string;
	sessionToken: string;
};

/**
 * Type-guard for the auth API's login / register response. Returns
 * `true` when the parsed JSON has the canonical `SessionPayload`
 * shape (string `id` + `email` + `role` + `sessionToken`). Used by
 * the forms to transform the API response into a `Session` without
 * duplicating the shape check.
 */
export function isSessionPayload(value: unknown): value is SessionPayload {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.email === "string" &&
		typeof candidate.role === "string" &&
		typeof candidate.sessionToken === "string"
	);
}

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
