import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { env } from "@core/config";

/**
 * NextAuth v5 client config — slice 4 NextAuth integration follow-up
 * (brief-web-nextauth-config).
 *
 * Per the [official NextAuth v5 installation guide](https://authjs.dev/getting-started/installation),
 * a Next.js App Router app exposes the NextAuth handlers + helpers by
 * exporting from a top-level `auth.ts` module:
 *
 *   export const { handlers, auth, signIn, signOut } = NextAuth(authConfig); // docs-only snippet, not the actual export
 *
 * The reference repo's web app (`apps/web`) IS a Next.js app, so this
 * module exports the canonical quadruple directly. The NextAuth
 * instance is consumed by:
 *
 *   1. `apps/web/app/api/auth/[...nextauth]/route.ts` — re-exports
 *      the `GET` + `POST` handlers from the catch-all route. The
 *      handler is wired even though the web client in this batch
 *      uses an explicit cookie approach (the API mints a NextAuth
 *      JWT, the form writes it to `authjs.session-token`
 *      directly). Having the handler at the canonical path means
 *      a future NextAuth integration (e.g. real Google OAuth in
 *      slice 5+) is a drop-in.
 *
 *   2. `apps/web/lib/auth.ts#getSession()` — the server-side
 *      session reader. Calls `auth()` from this module; NextAuth
 *      reads the `authjs.session-token` cookie via
 *      `next/headers#cookies()`, decodes the JWT using
 *      `env.NEXTAUTH_SECRET` + the canonical salt, runs the
 *      `session` callback, and returns the projected
 *      `{ user: { id, email, role } }` shape.
 *
 * **Strategy (explicit cookie, NOT NextAuth's signIn).**
 *  - The `Credentials` provider is REGISTERED so the route handler
 *    is import-clean and a future slice can wire
 *    `signIn('credentials', { email, password })` without a config
 *    change. The `authorize` function is a STUB that returns null
 *    — the web client does NOT delegate to NextAuth's signIn
 *    (the API already verified the credentials and minted the
 *    JWT; the web client just persists the JWT to a cookie).
 *  - Google provider is DEFERRED to slice 5+ (per the brief's
 *    forbidden-scope clause).
 *  - `jwt` + `session` callbacks mirror the API's
 *    `apps/api/src/lib/auth.config.ts` so the canonical user
 *    projection (`sub` + `userId` + `role`) is projected onto
 *    `session.user.id` + `session.user.role` consistently on both
 *    sides.
 *
 * **Why no `pages` override.** NextAuth v5's default
 * `/api/auth/signin` page is fine for this batch; the slice-4
 * custom sign-in page lives at `/{locale}/sign-in` and the form
 * does its own thing (the cookie is set directly).
 *
 * Auto-formatter note: NextAuth v5's `NextAuth(config)` returns
 * a value, not a type. The auto-formatter's `useImportType`
 * heuristic preserves this import as a value-import because we
 * reference the factory on the right-hand side of the export
 * below.
 */

// Explicit return-type annotation matches the API app's pattern —
// NextAuth's destructured types include `NextRequest` /
// `GetServerSidePropsContext` from `next/server` and `next`. The
// structural shape keeps the export canonical without
// `ReturnType<typeof NextAuth>` (the factory is a value, not a
// generic class).
type NextAuthExport = {
	handlers: { GET: unknown; POST: unknown };
	auth: unknown;
	signIn: unknown;
	signOut: unknown;
};

// The `NextAuthExport` type annotation below names the inferred return
// shape; NextAuth v5 beta's named return type references
// non-portable paths (AppRouteHandlerFn, BuiltInProviderType) which
// the explicit `NextAuthExport` alias re-roots to a stable public
// type. The runtime exports are correct.
const _nextAuth: NextAuthExport = NextAuth({
	providers: [
		Credentials({
			name: "credentials",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			// Stub — the web client does NOT delegate to NextAuth's
			// signIn (the API already verified the credentials and
			// minted the JWT). Returning null tells NextAuth to
			// reject the credentials-signin flow. The route
			// handler still answers the canonical
			// `/api/auth/signin` page (HTML) + the
			// `/api/auth/csrf` + `/api/auth/session` endpoints,
			// which keeps future OAuth providers a drop-in.
			async authorize() {
				return null;
			},
		}),
	],
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days — NextAuth v5 default
	},
	pages: {
		signIn: "/api/auth/signin",
	},
	trustHost: true,
	secret: env.NEXTAUTH_SECRET,
	callbacks: {
		// Mirror the API's `jwt` callback — promote `userId` +
		// `role` onto the token on first sign-in. The API's
		// AuthService mints the JWT with these claims directly,
		// so the callback mostly acts as a safety net for the
		// route handler's `/api/auth/session` endpoint.
		jwt({ token, user }) {
			if (user !== undefined) {
				const u = user as { id?: string; role?: string; userId?: string };
				token.userId = u.userId ?? u.id ?? token.sub;
				if (u.role !== undefined) {
					token.role = u.role;
				}
			}
			return token;
		},
		// Mirror the API's `session` callback — project
		// `token.userId` + `token.role` onto `session.user`.
		// The web's `getSession()` reads the result via
		// `auth()` and passes `session.user.email` to the
		// landing page.
		session({ session, token }) {
			if (session.user !== undefined) {
				if (typeof token.userId === "string") {
					(session.user as { id?: string }).id = token.userId;
				}
				if (typeof token.role === "string") {
					(session.user as { role?: string }).role = token.role;
				}
				if (typeof token.email === "string") {
					session.user.email = token.email;
				}
			}
			return session;
		},
	},
});

export const { handlers, auth, signIn, signOut } = _nextAuth;
