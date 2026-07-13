/**
 * apps/web/lib/auth-server.ts — slice 7 server/client split.
 *
 * The `getSession()` server-only function lives in its own file
 * so Next.js's bundler treats it as a server-only module. The
 * companion `auth-client.ts` holds the `setSessionCookie` /
 * `clearSessionCookie` browser-only functions (which use
 * `document.cookie`). The original `lib/auth.ts` barrel re-exports
 * both so existing call sites keep working without a refactor.
 *
 * **Why this matters.** Next.js's Pages Router vs App Router
 * detection treats files outside the `app/` tree as Pages Router
 * by default. A file that imports `next/headers` (a server-only
 * module) must be in the App Router server bundle; otherwise the
 * build fails with "next/headers import is only valid in Server
 * Components in the App Router, but you are using it in the Pages
 * Router". Splitting `lib/auth.ts` into
 * `auth-server.ts` + `auth-client.ts` + the barrel makes the
 * server / client boundary explicit, which the bundler
 * understands.
 *
 * **The `import "server-only"` guard (slice 8.1.2).** This is a
 * Next.js convention marker package: importing it from a module
 * that ends up in a client bundle throws at build time, which
 * makes the server-only contract explicit at the bundler level.
 * It is preventative — the build still fails (the barrel still
 * re-exports `getSession` from here, so client code that pulls
 * the barrel still pulls this file transitively), but a future
 * refactor that accidentally imports this file from a client
 * module would now fail loudly at build time instead of silently
 * bundling `next/headers` into the client tree.
 *
 * The split is purely a build-system concern. The behavior is
 * unchanged: `getSession()` reads the cookie via `next/headers`
 * `cookies()` on the server; `setSessionCookie` /
 * `clearSessionCookie` write / expire the cookie via
 * `document.cookie` on the client.
 */

import "server-only";

import { cookies } from "next/headers";

/**
 * 24 hours in seconds. Matches the API's SESSION_TTL_MS (24h). The
 * cookie's `max-age` directive uses this constant so a future change
 * to the API's TTL only needs to land in one place (the API).
 * (Local constant for now — slice 6+ can move to a shared
 * `libs/shared-utils` export once the API exposes its own constant.)
 */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

/**
 * Canonical NextAuth v5 cookie name. Exported so tests + the
 * sign-in / sign-up forms can read / write the same key without
 * spelling it twice. Matches the NextAuth v5 default
 * (`authjs.session-token`) so a future `auth()` integration is a
 * drop-in.
 */
export const AUTH_SESSION_COOKIE = "authjs.session-token";

/**
 * Session — the shape persisted in the cookie. `token` is the
 * opaque sessionToken the API returns on login / register; `user`
 * is the user projection the API embeds in the same response.
 */
export type Session = {
	token: string;
	user: { id: string; email: string; role: string };
};

/**
 * Decode the raw cookie value into a `Session` or return `null` when
 * the value is missing, malformed JSON, or fails the structural
 * shape check. Kept as a pure helper so `getSession` is a thin
 * wrapper around `cookies()` + this decoder.
 */
export function decodeSession(raw: string | undefined): Session | null {
	if (raw === undefined || raw === "") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
	} catch {
		return null;
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("user" in parsed) ||
		!("token" in parsed)
	) {
		return null;
	}
	const candidate = parsed as { token: unknown; user: unknown };
	if (
		typeof candidate.token !== "string" ||
		typeof candidate.user !== "object" ||
		candidate.user === null
	) {
		return null;
	}
	const user = candidate.user as { id: unknown; email: unknown; role: unknown };
	if (
		typeof user.id !== "string" ||
		typeof user.email !== "string" ||
		typeof user.role !== "string"
	) {
		return null;
	}
	return {
		token: candidate.token,
		user: { id: user.id, email: user.email, role: user.role },
	};
}

/**
 * Read the canonical NextAuth cookie via `next/headers#cookies` and
 * return the decoded `Session`, or `null` when the cookie is absent
 * / malformed. Async because `cookies()` returns a `Promise` in
 * Next.js 15+. The cookie NAME is the only thing this function
 * cares about (the attributes are not parsed by `cookies()` — they
 * are stored on the `RequestCookie` object for inspection but the
 * canonical contract is the name + value pair).
 */
export async function getSession(): Promise<Session | null> {
	const store = await cookies();
	const raw = store.get(AUTH_SESSION_COOKIE)?.value;
	return decodeSession(raw);
}

/**
 * Shape the auth API's login / register response takes. Re-exported
 * as a type so the form-level `onSuccess` can assert on the API
 * contract without a hand-rolled intersection.
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
