import { encode } from "next-auth/jwt";

import { NEXTAUTH_SESSION_TOKEN_NAME } from "../../src/lib/auth.constants.js";

/**
 * Mint a NextAuth v5 JWT for tests.
 *
 * Used by the apps/api e2e tests that exercise the real `JwtAuthGuard`
 * (slice 3 / T3.3 GREEN). The guard decodes the bearer JWT with
 * `next-auth/jwt#decode` using the SAME `secret` + `salt` as the
 * NextAuth instance minted in `apps/api/src/lib/auth.ts`; this helper
 * is the encoder half of the same wire format.
 *
 * Re-exported from `apps/api/test/helpers/mint-jwt.ts` (slice 3 batch 8
 * — T3.7 session-expiry integration) so the new
 * `session-expiry.e2e-spec.ts` and any future guard-level test can mint
 * tokens with arbitrary claims + expiry without re-implementing the
 * `encode` call. The salt is the canonical
 * `NEXTAUTH_SESSION_TOKEN_NAME` from `apps/api/src/lib/auth.constants.ts`
 * so encoder + decoder never drift.
 *
 * The signature mirrors `next-auth/jwt#encode`:
 *   - `secret` MUST match `env.NEXTAUTH_SECRET` at runtime.
 *   - `claims` is the JWT payload (the `token` argument of the
 *     `jwt` callback in `auth.config.ts`).
 *   - `maxAgeSeconds` defaults to 30 days (matches NextAuth v5 default).
 *
 * To mint an EXPIRED token (one whose `exp` claim sits in the past),
 * pass a NEGATIVE `maxAgeSeconds` — NextAuth's `encode` stamps
 * `exp = floor(now / 1000) + maxAge`, so a negative value places the
 * claim in the past. Tests MUST use a value well below NextAuth's
 * `clockTolerance: 15` seconds (e.g., `-3600` for 1h) so the decoder
 * does not accept the token under the clock-skew tolerance.
 *
 * The `iat` claim is stamped from `Date.now()` by `@auth/core/jwt`
 * with no override hook, so the helper does not expose an `issuedAt`
 * option — pass the desired issuance via the JWT `iat` field in
 * `claims` if a test needs a precise issuance timestamp.
 *
 * @example
 *   // Valid token — guard decodes + projects to CurrentUser.
 *   const jwt = await mintJwt({ sub: "user-1", email: "a@b.c", role: "USER" });
 *
 * @example
 *   // Expired token — guard decodes to null and rejects with 401.
 *   const expired = await mintJwt(
 *     { sub: "user-1", email: "a@b.c", role: "USER" },
 *     { maxAgeSeconds: -3600 },
 *   );
 */

const DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — NextAuth default

export interface MintJwtOptions {
	/**
	 * Override the maxAge in seconds. A negative value produces a token
	 * whose `exp` claim sits in the past (relative to the current time).
	 * Default: 30 days (NextAuth v5 default).
	 *
	 * For expiry assertions, use a value below NextAuth's
	 * `clockTolerance: 15` seconds (e.g., `-3600`) so the decoder does
	 * not accept the token under the clock-skew tolerance.
	 */
	maxAgeSeconds?: number;
}

export async function mintJwt(
	claims: Readonly<Record<string, unknown>>,
	options?: MintJwtOptions,
	secret = process.env["NEXTAUTH_SECRET"] ?? "",
): Promise<string> {
	if (secret === "") {
		throw new Error(
			"mintJwt requires NEXTAUTH_SECRET to be set (the guard reads it via env.NEXTAUTH_SECRET at decode time).",
		);
	}

	const maxAgeSeconds = options?.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;

	return encode({
		token: claims,
		secret,
		salt: NEXTAUTH_SESSION_TOKEN_NAME,
		maxAge: maxAgeSeconds,
	});
}
