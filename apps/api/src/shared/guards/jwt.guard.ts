import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { decode } from "next-auth/jwt";

import { env } from "@core/config";

import type { CurrentUser } from "@features/auth";

import { NEXTAUTH_SESSION_TOKEN_NAME } from "../../lib/auth.constants.js";

/**
 * Real NextAuth v5 JWT auth guard — T3.3 (slice 3 batch 7).
 *
 * Replaces the slice-3-batch-6 stub (which parsed `<userId>:<token>`
 * bearer strings) with a guard backed by NextAuth v5's JWT
 * encoder/decoder.
 *
 * Strategy (per the T3.3 brief):
 *   1. Read `Authorization: Bearer <token>` from the request headers.
 *      Missing / malformed → 401.
 *   2. Decode the JWT via `@auth/core/jwt#decode` using the SAME
 *      `secret` + `salt` as the NextAuth instance minted with in
 *      `apps/api/src/lib/auth.ts`. Both sides agree on
 *      `NEXTAUTH_SESSION_TOKEN_NAME` as the salt (see
 *      `apps/api/src/lib/auth.constants.ts`).
 *   3. Project the JWT claims onto the canonical `CurrentUser`
 *      shape (`{ id, email, role }`) and attach it to `request.user`
 *      for downstream handlers / controllers.
 *
 * Why `@auth/core/jwt#decode` instead of the canonical `auth()`
 * helper: the brief's stated strategy uses `auth()` from
 * `next-auth`, but `auth()` depends on Next.js's `headers()` and
 * `cookies()` globals. The API app (`apps/api`) is NestJS, not
 * Next.js — we have only `Request` access. The lower-level
 * `@auth/core/jwt#decode` works without Next.js globals because
 * the secret + salt + token are passed explicitly. The wire format
 * is the same one NextAuth v5 produces, so a token minted by a
 * client (slice 4 web app's `signIn()`) is accepted here without
 * translation.
 *
 * Slice 4 will likely add the canonical `auth()` helper to its
 * server components; the API guard keeps the JWT-decode approach
 * because NestJS routing is the API's responsibility.
 *
 * Trust boundary: the guard treats any successfully-decoded JWT as
 * a valid session. JWT expiry is enforced by NextAuth's decoder
 * (`exp` claim) — expired tokens decode to `null` and the guard
 * rejects them with 401. The `userId` / `role` / `email` claims
 * are the source of truth; we do NOT re-fetch the user from the DB
 * inside the guard (the controller does that if it needs
 * authoritative state). This is a deliberate trade-off — a JWT
 * whose user was soft-deleted between issuance and the current
 * request will still authenticate, but the controller's downstream
 * service call will surface the deletion. Future slices may add a
 * per-request user-exists check if audit findings require it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request>();

		const header = request.headers.authorization;
		if (typeof header !== "string" || !header.startsWith("Bearer ")) {
			throw new UnauthorizedException("missing or malformed bearer token");
		}

		const token = header.slice("Bearer ".length).trim();
		if (token === "") {
			throw new UnauthorizedException("missing bearer token");
		}

		let claims: Record<string, unknown> | null = null;
		try {
			claims = await decode({
				token,
				secret: env.NEXTAUTH_SECRET,
				salt: NEXTAUTH_SESSION_TOKEN_NAME,
			});
		} catch {
			// `decode` returns null on expired / wrong-secret tokens but
			// can throw on completely malformed input (e.g. a non-JWT
			// string, an unparseable payload). Both shapes fail the same
			// way from the caller's perspective: 401.
			claims = null;
		}
		if (claims === null) {
			// `decode` returns null on expired / malformed / wrong-secret
			// tokens. We use a single generic copy for every failure mode
			// to avoid leaking which side failed (parallels D-AUTH-1 from
			// the auth spec: no enumeration leak across the credential
			// failure modes).
			throw new UnauthorizedException("invalid bearer token");
		}

		const user = toCurrentUser(claims);
		(request as { user?: CurrentUser }).user = user;
		return true;
	}
}

/**
 * Project a NextAuth JWT claims object onto the canonical
 * `CurrentUser` shape used across the slice (`{ id, email, role }`).
 *
 * The shape on the wire is determined by the `jwt` + `session`
 * callbacks in `apps/api/src/lib/auth.config.ts`:
 *   - `jwt` promotes `userId` + `role` onto the token on first
 *     sign-in (the `user` argument is the `authorize` return value).
 *   - `session` projects `token.userId` + `token.role` onto
 *     `session.user`.
 *
 * The `userId` claim is the canonical handle (matches `User.id` in
 * the Prisma schema). The `sub` claim is the standard JWT subject
 * claim; we fall back to it when `userId` is absent (defensive — the
 * canonical `jwt` callback always sets `userId`).
 *
 * `email` is the user's email at sign-in time. We trust the JWT
 * here (the controller's downstream service calls would surface a
 * stale-email condition if the user changed addresses between
 * issuance and the current request).
 */
function toCurrentUser(
	claims: Readonly<Record<string, unknown>>,
): CurrentUser {
	const userId = pickString(claims["userId"]) ?? pickString(claims["sub"]);
	const email = pickString(claims["email"]) ?? "";
	const role = pickString(claims["role"]) ?? "USER";

	if (userId === null || userId === "") {
		// A token with no subject is structurally invalid. Treat as a
		// 401 rather than throwing at projection time — keeps the
		// public error copy consistent with the rest of the guard.
		throw new UnauthorizedException("invalid bearer token");
	}

	return { id: userId, email, role };
}

/**
 * Narrow `unknown` to `string | null`. Returns `null` for non-string
 * values; the caller decides the fallback. We deliberately do NOT
 * throw here — the guard's outer `canActivate` handles missing /
 * malformed claims uniformly.
 */
function pickString(value: unknown): string | null {
	if (typeof value === "string" && value.length > 0) {
		return value;
	}
	return null;
}