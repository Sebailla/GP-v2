/**
 * apps/web/lib/auth.ts — slice 4 batch 2 (post-4e T3.3 deferred follow-up).
 *
 * Custom session helpers for the web client. The web client uses a
 * plain `auth-session` cookie (NOT NextAuth's `authjs.session-token`)
 * to persist the session token + user projection returned by
 * `POST /auth/login` and `POST /auth/register`. The sessionToken
 * minted by the auth API is a `randomUUID()` string — opaque to the
 * client. The user projection is the `{ id, email, role }` shape the
 * API returns.
 *
 * **Why a custom cookie and not NextAuth's.**
 *  - The API's `sessionToken` is NOT a NextAuth JWT. Swapping to
 *    NextAuth's session-token format would require the API to mint a
 *    NextAuth JWT on every login/register, which is a slice 3
 *    follow-up (T3.7 / T3.9 multi-provider path). Until that lands,
 *    the custom cookie is the simplest path that gives the web client
 *    a real authenticated session across page reloads.
 *  - Per the slice-4 design notes, the cookie name `auth-session` is
 *    chosen to avoid collision with a future NextAuth integration
 *    (the NextAuth default is `authjs.session-token`).
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
 *  - Name: `auth-session`.
 *  - Value: `encodeURIComponent(JSON.stringify({ token, user }))`.
 *  - Attributes: `path=/`, `max-age=86400` (24h), `SameSite=Lax`,
 *    `Secure` is FALSE in dev (the reference repo's `pnpm dev` runs
 *    on `http://localhost:3000`; Secure would be rejected by the
 *    browser). Production should flip the flag via an env-derived
 *    constant when this is deployed to a real domain — slice 6+ /
 *    deploy hardening.
 */

import { cookies } from "next/headers";

/**
 * Canonical cookie name. Exported so tests + the sign-in / sign-up
 * forms can read / write the same key without spelling it twice.
 */
export const AUTH_SESSION_COOKIE = "auth-session";

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
 * Read the auth-session cookie via `next/headers#cookies` and return
 * the decoded `Session`, or `null` when the cookie is absent /
 * malformed. Async because `cookies()` returns a `Promise` in
 * Next.js 15+ (the brief's signature was sync — see deviation note
 * in apply-progress slice 4 batch 2).
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(AUTH_SESSION_COOKIE)?.value;
  return decodeSession(raw);
}

/**
 * Encode the session as a JSON string and write it to
 * `document.cookie` with the canonical attributes. Client-side only
 * — server components calling this would throw `document is not
 * defined`. The `encodeURIComponent` round-trip matches the
 * `decodeURIComponent` in `decodeSession` so non-ASCII characters
 * in the email field don't break the cookie parser.
 *
 * `Secure` is intentionally FALSE for the reference repo's dev
 * setup (`http://localhost:3000`); see file-level doc.
 */
export function setSessionCookie(session: Session): void {
  const value = encodeURIComponent(JSON.stringify(session));
  const attributes = [
    `${AUTH_SESSION_COOKIE}=${value}`,
    "path=/",
    "max-age=86400",
    "SameSite=Lax",
  ].join("; ");
  document.cookie = attributes;
}

/**
 * Expire the auth-session cookie by setting `Max-Age=0`. Mirrors
 * `setSessionCookie`'s path so the browser knows which cookie to
 * remove. The value is intentionally empty — the cookie is about to
 * be deleted; its content is irrelevant.
 */
export function clearSessionCookie(): void {
  document.cookie = `${AUTH_SESSION_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}
