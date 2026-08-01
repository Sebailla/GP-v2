import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { env } from "@core/config/web";

import { isGoogleMockEnabled } from "./lib/google-enabled";

/**
 * NextAuth v5 client config — slice 4 NextAuth integration follow-up
 * (brief-web-nextauth-config) + Module-2 PR #4 task 4.6 (`google-mock`
 * gating per design D4).
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
 *   2. `apps/web/lib/auth-server.ts#getSession()` — the server-side
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
 *  - Google provider (D4 — Module-2 PR #4 task 4.6) is registered
 *    CONDITIONALLY — when both Google credentials AND a runtime
 *    marker are present, the real Google provider joins the
 *    providers array. When the credentials are missing, a
 *    `google-mock` Credentials provider can register in its place
 *    so the OAuth handshake contract is exercised in CI (D4 /
 *    `GOOGLE_E2E_MOCK=1`).
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
 * **D4 — `google-mock` Credentials provider.** Per
 * `openspec/changes/module-2-public-auth/design.md` §2 D4:
 *   "`google-mock` Credentials only outside production with
 *    `GOOGLE_E2E_MOCK=1`. Exercises NextAuth without external
 *    instability; real Google stays M6."
 *
 * The provider is a `Credentials` provider that returns a
 * pre-baked verified profile (`{ email, name, emailVerified }`)
 * to the adapter when invoked. The authorize hook is gated by
 * `isGoogleMockEnabled()` (apps/web/lib/google-enabled.ts), which
 * enforces `GOOGLE_E2E_MOCK === "1" AND NODE_ENV !== "production"`
 * — defense in depth so a production deploy with a leaked
 * `GOOGLE_E2E_MOCK=1` never registers the mock provider. The
 * provider ID is `"google-mock"` so the SignInClient can target it
 * directly via `signIn("google-mock", { callbackUrl: ... })`.
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

/**
 * Build the providers array for this runtime (Module-2 PR #4 task 4.6).
 *
 * The base provider list is ALWAYS the `Credentials` provider (the
 * stub authorize hook — the API handles real credential verification).
 * The Google branch is conditional:
 *
 *   - Real Google provider: registered when both `GOOGLE_CLIENT_ID` and
 *     `GOOGLE_CLIENT_SECRET` are set. (DEFERRED to a future slice in
 *     this PR — env-conditional wiring already lives in
 *     `apps/api/src/lib/auth.config.ts`; the web app historically did
 *     not register Google because the form persists cookies directly.
 *     A future module registers the real provider here.)
 *
 *   - `google-mock` Credentials provider: registered ONLY when
 *     `isGoogleMockEnabled()` returns `true` (`GOOGLE_E2E_MOCK=1` AND
 *     `NODE_ENV !== "production"`). The mock provider's `authorize`
 *     returns a stubbed verified profile so the adapter's auto-link
 *     path runs end-to-end in CI without real Google OAuth.
 *
 * The export is a function (not a `const`) so tests can vary env
 * between cases. The `handler` export below derives from a single
 * authoritative factory.
 *
 * The return type is structural: `NextAuthConfig["providers"]` would
 * also work, but NextAuth v5's overload accepts either a config object
 * OR a function returning one — the inferred union type makes
 * destructuring painful. The structural type keeps the export focused.
 */
function buildProviders(): Array<ReturnType<typeof Credentials>> {
  const baseProviders: Array<ReturnType<typeof Credentials>> = [
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
  ];
  // Module-2 PR #4 task 4.6 — `google-mock` provider (D4). The
  // predicate enforces BOTH conditions: `GOOGLE_E2E_MOCK === "1"`
  // AND `NODE_ENV !== "production"`. The Credentials stub returns
  // a pre-baked profile to the adapter so the OAuth handshake
  // path is exercisable in CI without a real Google round-trip.
  if (isGoogleMockEnabled()) {
    baseProviders.push(
      Credentials({
        id: "google-mock",
        name: "Google (mock)",
        credentials: {
          email: { label: "Email", type: "email" },
        },
        // The authorize hook returns a stubbed verified profile.
        // The `email` field is taken from the form input; tests
        // can pin a deterministic value via page.route(). Real
        // production usage MUST NOT register this provider (D4).
        async authorize(creds) {
          const email = creds?.["email"];
          if (typeof email !== "string" || email.trim() === "") {
            return null;
          }
          return {
            id: `mock-${email}`,
            email,
            name: "Google Mock User",
            image: null,
          };
        },
      }),
    );
  }
  return baseProviders;
}

// The `NextAuthExport` type annotation below names the inferred return
// shape; NextAuth v5 beta's named return type references
// non-portable paths (AppRouteHandlerFn, BuiltInProviderType) which
// the explicit `NextAuthExport` alias re-roots to a stable public
// type. The runtime exports are correct.
const _nextAuth: NextAuthExport = NextAuth({
  providers: buildProviders(),
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
