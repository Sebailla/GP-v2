/**
 * apps/web/lib/auth-shared.ts — auth surface shared between the
 * server-only module (`auth-server.ts`) and the middleware bundle
 * (`apps/web/middleware.ts`).
 *
 * **Slice 2 / v1.4.0 refactor:** prior to v1.4.0, the cookie was
 * decoded differently by the server (`auth-server.ts#decodeSession`,
 * plain JSON via `JSON.parse(decodeURIComponent(raw))`) and by the
 * middleware (`middleware.ts#decodeAdminSession`, JWT via
 * `next-auth/jwt#decode` with the `NEXTAUTH_SECRET`). The two
 * decoders could never agree on a single cookie value, so the
 * admin guard (which is part of the middleware) and the (app)
 * layout's session guard (which is part of the server) reported
 * different "is the user signed in?" answers for the same request.
 *
 * v1.4.0 collapses the two surfaces into a single canonical
 * format. The format is **plain JSON-encoded** (no JWT signature
 * — the reference repo's dev-mode session is a plain payload, not
 * a real NextAuth JWT). The encoding is:
 *
 *   JSON.stringify(session)                       // server writes
 *   encodeURIComponent(JSON.stringify(session))  // the value the browser stores
 *   JSON.parse(decodeURIComponent(cookieValue))   // either side reads
 *
 * Both `auth-server.ts#getSession` and `middleware.ts#adminGuard`
 * call into this module's `decodeSession` and read the same
 * `AUTH_SESSION_COOKIE` constant. One source of truth.
 *
 * **Why no `server-only` import here.** The middleware bundle is
 * evaluated in the Node runtime, but the `server-only` empty-shim
 * from `apps/web/vitest.config.ts` is only available inside the
 * vitest config — not at middleware-import time. By keeping the
 * shared surface in a neutral module (no `server-only` import), the
 * middleware can import it without throwing at module load.
 *
 * **Why this is a backward-incompatible cookie change.** Any
 * existing session cookies set by the slice-2 client-side
 * `setSessionCookie` (which used the same JSON-encoded format
 * the server expected) will continue to decode correctly. The
 * breaking change is on the JWT path: any cookie signed via
 * `next-auth/jwt#encode` with `NEXTAUTH_SECRET` will now fail to
 * decode. Since the reference repo never issued real JWTs (the
 * `setSessionCookie` client always wrote the plain JSON format),
 * there are no production JWTs to invalidate. The v1.4.0 release
 * notes this as a behavioral change for any external consumer
 * (e.g. a future NextAuth.js integration that signs real JWTs).
 */

export const AUTH_SESSION_COOKIE = "authjs.session-token";

/**
 * The canonical session shape. Both `auth-server.ts#getSession`
 * and `middleware.ts#adminGuard` produce/consume this shape.
 */
export type Session = {
  readonly token: string;
  readonly user: { readonly id: string; readonly email: string; readonly role: string };
};

/**
 * Decode the raw cookie value into a `Session` or return `null`
 * when the value is missing, malformed, or fails the structural
 * shape check. Pure helper — exported from a neutral module so
 * both the server (RSC) and the middleware bundle can call it.
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
 * Encode a `Session` for cookie storage. The format matches
 * what `decodeSession` reads — symmetric, so any client that
 * writes via `encodeSession` can be read by either guard.
 */
export function encodeSession(session: Session): string {
  return encodeURIComponent(JSON.stringify(session));
}
