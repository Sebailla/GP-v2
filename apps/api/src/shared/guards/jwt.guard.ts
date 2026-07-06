import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Stub JWT auth guard (slice 3 batch 6 — T3.6 NestJS wrapper).
 *
 * Per the brief, this is a STUB for slice 3 — the real NextAuth v5 JWT
 * verification is deferred to T3.3 (next-auth config, slice 3 batch 7).
 *
 * Slice-3 behavior:
 *  - Reads the `Authorization: Bearer <token>` header.
 *  - If missing/malformed → throws 401.
 *  - If present → parses the token as `<userId>:<sessionToken>` and
 *    attaches `{ userId, sessionToken }` to `request.user` so
 *    downstream handlers can call
 *    \`SessionService.revokeSession(token, userId)\` (Pattern A,
 *    slice 3 batch 6).
 *
 * Why a stub: slice 3 batch 6's brief explicitly defers the real
 * JWT verification to T3.3. A self-contained guard (no service
 * dependencies) keeps the DI graph minimal and lets the e2e tests
 * forge an authed request without bootstrapping the full NextAuth
 * stack.
 *
 * The \`extractUser\` method is the seam for T3.3 — when the NextAuth
 * JWT decoder lands, the body of \`extractUser\` is replaced by the
 * \`decodeJwt(token)\` call. The public surface (the \`user\` field
 * shape on \`request.user\`) stays identical.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context
			.switchToHttp()
			.getRequest<
				Request & { user?: { userId: string; sessionToken: string } }
			>();

		const header = request.headers.authorization;
		if (typeof header !== "string" || !header.startsWith("Bearer ")) {
			throw new UnauthorizedException("missing or malformed bearer token");
		}

		const user = this.extractUser(header.slice("Bearer ".length).trim());
		if (user === null) {
			throw new UnauthorizedException("invalid bearer token");
		}
		request.user = user;
		return true;
	}

	/**
	 * Slice-3 stub token parser. The forge shape is `<userId>:<token>`
	 * so the e2e tests can supply an authed request without a real
	 * NextAuth v5 JWT. Replace with the JWT decoder in T3.3.
	 */
	private extractUser(rawToken: string): {
		userId: string;
		sessionToken: string;
	} | null {
		if (rawToken === "") {
			return null;
		}
		const sep = rawToken.indexOf(":");
		if (sep < 1) {
			return null;
		}
		const userId = rawToken.slice(0, sep);
		const sessionToken = rawToken.slice(sep + 1);
		if (userId === "" || sessionToken === "") {
			return null;
		}
		return { userId, sessionToken };
	}
}
