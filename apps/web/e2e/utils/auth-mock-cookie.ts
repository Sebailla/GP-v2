/**
 * apps/web/e2e/utils/auth-mock-cookie.ts
 *
 * v1.4.0 auth-cookie refactor: the canonical helper for
 * `authjs.session-token` mock values in Playwright specs.
 *
 * Per `apps/web/lib/auth-shared.ts#encodeSession`, the production
 * cookie value is `encodeURIComponent(JSON.stringify(session))`
 * where `session = {user: {id, email, role}, token}`. The
 * `apps/api/src/modules/auth/auth.controller.ts#login` and
 * `#register` handlers emit the same encoding via
 * `Set-Cookie`. The middleware + server read it through
 * `auth-shared#decodeSession`, which performs the symmetric
 * `JSON.parse(decodeURIComponent(raw))`.
 *
 * Every `page.route()` mock that needs to fake the session cookie
 * MUST use the encoding produced here, otherwise the server-side
 * `getSession()` call returns `null` after the redirect and the
 * user lands on `/sign-in` again instead of `/{locale}/(app)`.
 *
 * The shape stays in lockstep with the canonical `Session` type
 * in `apps/web/lib/auth-shared.ts`. If a future slice changes
 * the session shape, this file is the single edit point.
 */

import type { Session } from "../../lib/auth-shared.js";

/**
 * Encode a `Session` exactly the way the production API writes
 * the cookie value: `encodeURIComponent(JSON.stringify(session))`.
 *
 * The result is the literal string the browser stores in
 * `document.cookie.authjs.session-token`. Specs hand this value
 * to `page.route()`'s `headers["set-cookie"]` so the cookie
 * round-trips through `decodeSession` successfully.
 */
export function encodeMockSessionCookie(session: Session): string {
  return encodeURIComponent(JSON.stringify(session));
}

/**
 * Convenience: build the standard `Set-Cookie` header value the
 * production API emits. Mirrors the controller's header literal
 * (`auth.controller.ts#login`, `auth.controller.ts#register`)
 * byte-for-byte, including the `Max-Age=86400` window. The
 * `Secure` flag is intentionally absent (would break on
 * `http://localhost`).
 */
export function buildMockSessionSetCookie(session: Session): string {
  return `authjs.session-token=${encodeMockSessionCookie(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

/**
 * Canonical mock session for the google-mock + vertical-auth
 * + forgot-reset specs. The shape matches a registered test
 * user; tests that need different identity data build their
 * own `Session` literal and pass it to `buildMockSessionSetCookie`.
 */
export const MOCK_TEST_SESSION: Session = {
  user: {
    id: "user-alice",
    email: "alice@example.com",
    role: "USER",
  },
  token: "mock-jwt",
};
