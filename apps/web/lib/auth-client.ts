/**
 * apps/web/lib/auth-client.ts — slice 7 server/client split +
 * slice 8.1.2 client-side surface expansion + v1.4.0 refactor.
 *
 * Browser-only helpers: `isSessionPayload` (type guard for the API
 * login / register response shape) and `clearSessionCookie` (expire
 * the session cookie on sign-out). The companion `auth-server.ts`
 * holds the server-only `getSession()` plus the cookie
 * read/decoder surface.
 *
 * **v1.4.0 refactor — `setSessionCookie` removed.** Prior to v1.4.0,
 * this file wrote the `authjs.session-token` cookie via
 * `document.cookie = "authjs.session-token=...; HttpOnly; ..."`.
 * Real browsers silently ignore `HttpOnly` set via `document.cookie`
 * (the flag is only honored when emitted via a `Set-Cookie` HTTP
 * response header from the server), so the cookie was written
 * WITHOUT the flag — which then made the cookie JS-readable but
 * the slice-2 `decodeSession` returned null when the server tried
 * to read it back (the cookie's URL-encoding was the inverse of
 * what the server's `decodeURIComponent` expected on the read path).
 * v1.4.0 moved the cookie write to the server side: the
 * `apps/api` `/auth/login` and `/auth/register` endpoints now
 * emit the cookie via a real `Set-Cookie` response header, so
 * HttpOnly works as designed. The client no longer needs to write
 * the cookie itself — `setSessionCookie` is removed entirely.
 *
 * The `clearSessionCookie` function remains: sign-out still needs
 * to expire the cookie client-side (there is no `/auth/logout`
 * endpoint yet, and even when there is, JS can clear the cookie
 * before the server round-trip for an immediate visual state).
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
 * Expire the authjs.session-token cookie by setting `Max-Age=0`.
 * Mirrors the server's `Set-Cookie` shape so the browser knows
 * which cookie to remove. The value is intentionally empty — the
 * cookie is about to be deleted; its content is irrelevant.
 *
 * Note: `Max-Age=0` is intentionally capitalized (the
 * `Max-Age=<delta-seconds>` directive is case-insensitive in the
 * cookie spec but the canonical form is `Max-Age`; mirroring the
 * server's `Set-Cookie` lowercase pattern would be a minor
 * inconsistency we accept here for visual symmetry).
 */
export function clearSessionCookie(): void {
	document.cookie = `authjs.session-token=; path=/; Max-Age=0; SameSite=lax`;
}

/**
 * Re-export `Session` for client code that needs the canonical shape
 * (e.g. UI components that read session fields from the API
 * response before persisting it). The `Session` type itself lives
 * in `auth-server.ts` (server-only) so it can co-locate with the
 * decoder; this re-export lets client modules pull the type from
 * the same module as the cookie writer.
 */
export type { Session } from "./auth-server.js";
