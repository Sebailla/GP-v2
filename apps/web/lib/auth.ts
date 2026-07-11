/**
 * apps/web/lib/auth.ts — slice 4 cookie migration (final, post-NextAuth integration).
 *
 * Session helpers for the web client. Migrated from the bespoke
 * `auth-session` cookie name (slice 4 batch 2) to the canonical
 * NextAuth v5 cookie name `authjs.session-token` so a future
 * NextAuth `auth()` integration is a drop-in: the cookie is already
 * at the name NextAuth expects.
 *
 * **Why migrate now.**
 *  - PR #21 (slice 4 NextAuth integration) landed the API-side
 *    NextAuth v5 mint (the API's `AuthService` now mints a real
 *    NextAuth JWE session token via `next-auth/jwt#encode`). The
 *    remaining gap was the web-side cookie name: keeping
 *    `auth-session` while the API uses `next-auth/jwt` means the
 *    two halves of the integration would be desynced. Migrating the
 *    cookie name to `authjs.session-token` aligns the cookie name
 *    with what NextAuth's `auth()` helper would consume natively.
 *  - The cookie VALUE stays the same (`encodeURIComponent(JSON.stringify({ token, user }))`).
 *    The form still sets it via `document.cookie` — the API change
 *    doesn't ripple to the cookie shape, only to the name.
 *  - The cookie ATTRIBUTES are updated to the canonical NextAuth v5
 *    contract: `path=/`, `max-age=24*60*60` (24h, matching the API's
 *    `SESSION_TTL_MS`), `SameSite=lax` (lowercase per HTTP standard),
 *    `HttpOnly` (hint — browsers ignore HttpOnly set via
 *    `document.cookie` from JS, but the directive is canonical and
 *    matches the Set-Cookie header a real NextAuth `signIn(...)`
 *    call would emit). `Secure` is INTENTIONALLY OMITTED — the
 *    reference repo's `pnpm dev` runs on `http://localhost:3000`,
 *    and the browser rejects `Secure` cookies on non-HTTPS origins.
 *    When the real Set-Cookie integration lands (slice 6+ deploy
 *    hardening), the `Secure` flag belongs in the server-side
 *    `Set-Cookie` header, not in the client-side `document.cookie`.
 *
 * **Two execution contexts.**
 *  - `getSession()` — server side. Reads the cookie via
 *    `cookies()` from `next/headers` (async in Next.js 15+). Used by
 *    RSC pages to short-circuit the redirect-if-already-authenticated
 *    check.
 *  - `setSessionCookie()` + `clearSessionCookie()` — client side.
 *    Write / expire the cookie via `document.cookie`. Used by the
 *    sign-in / sign-up forms' success paths to persist the session
 *    before navigating to the authenticated landing.
 *
 * **Cookie shape.**
 *  - Name: `authjs.session-token` (canonical NextAuth v5).
 *  - Value: `encodeURIComponent(JSON.stringify({ token, user }))`.
 *  - Attributes: `path=/`, `max-age=24*60*60` (24h, explicit),
 *    `SameSite=lax` (lowercase), `HttpOnly` (hint).
 */

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
function decodeSession(raw: string | undefined): Session | null {
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
  const attributes = [
    `${AUTH_SESSION_COOKIE}=${value}`,
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
  document.cookie = `${AUTH_SESSION_COOKIE}=; path=/; Max-Age=0; SameSite=lax`;
}
