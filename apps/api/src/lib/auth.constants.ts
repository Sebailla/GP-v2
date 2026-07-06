/**
 * Shared constants for the NextAuth v5 wiring (T3.3, slice 3 batch 7).
 *
 * Kept in a dedicated `lib/auth.constants.ts` module (rather than inlined
 * inside `auth.config.ts` / `auth.ts`) so the test harness can mint a
 * JWT with the same `salt` the guard uses to decode it. Per
 * `@auth/core/jwt#encode`, the salt is the cookie name NextAuth uses
 * for the session — both encoder and decoder must agree.
 *
 * Constants are intentionally minimal and additive — they DO NOT
 * duplicate env-derived values. Anything that lives in the Zod env
 * schema (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, ...) must be imported
 * from `@core/config`, not redeclared here.
 */

/**
 * The NextAuth v5 cookie name (and thus the `salt` value passed to
 * `encode` / `decode` from `@auth/core/jwt`) for non-secure contexts.
 *
 * NextAuth uses the prefixed form (`__Secure-...`) when the request URL
 * is `https://...`; for `http://...` (dev, test, localhost) it falls
 * back to the unprefixed name. The reference repo's dev/test path is
 * always unprefixed (NEXTAUTH_URL points at `http://localhost:...`)
 * so this constant is the single source of truth.
 *
 * The guard's `decode` call MUST pass this same string as `salt`,
 * otherwise HKDF-derived keys diverge and decryption fails.
 */
export const NEXTAUTH_SESSION_TOKEN_NAME = "authjs.session-token" as const;

/**
 * Cookie name NextAuth uses for the CSRF token on sign-in pages.
 * Declared here for symmetry / future NextAuth-middleware needs;
 * not currently consumed by the guard but documented so slice 4 can
 * reach for it without re-discovering the convention.
 */
export const NEXTAUTH_CSRF_TOKEN_NAME = "authjs.csrf-token" as const;

/**
 * Default session age (seconds) — mirrors NextAuth v5's default. The
 * JWT minted by `encode()` carries an `exp` claim derived from this;
 * the guard accepts any token whose `exp` is in the future.
 */
export const NEXTAUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Salt used to derive the session cookie's encryption key. NextAuth
 * v5's `auth.js` uses the cookie NAME as the salt; declaring it as a
 * named constant prevents drift between encode/decode call sites.
 */
export const NEXTAUTH_SESSION_SALT = NEXTAUTH_SESSION_TOKEN_NAME;