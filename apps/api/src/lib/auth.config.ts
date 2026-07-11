import type { NextAuthConfig } from "next-auth";

import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@core/database";
import { env } from "@core/config";

import { AuthService } from "@features/auth";

import { NEXTAUTH_SESSION_MAX_AGE_SECONDS, NEXTAUTH_SESSION_TOKEN_NAME } from "./auth.constants.js";

/**
 * NextAuth v5 configuration — T3.3 (slice 3 batch 7).
 *
 * Per `openspec/changes/.../design.md` §4 (auth slice) and §3.4 (single
 * PrismaClient instance), this module is the canonical NextAuth wiring
 * for the workspace:
 *
 *   - `@auth/prisma-adapter` against the workspace `@core/database`
 *     singleton — the adapter is the boundary, NOT a place where
 *     `new PrismaClient()` lives (the slice-wide `no-prisma-outside-core`
 *     ESLint rule would fire if it did).
 *
 *   - `CredentialsProvider` delegates the email+password check to
 *     `AuthService.login` (the brief specifies `verifyPassword`; the
 *     AuthService shape is stable per the T3.3 forbidden-scope clause,
 *     so we use `login` and project the user fields onto the User
 *     shape NextAuth's `authorize` expects).
 *
 *   - `GoogleProvider` is REGISTERED for slice 4 (auth client) but the
 *     real OAuth handshake is DEFERRED to T3.7 (multi-provider test).
 *     The provider reads `clientId` / `clientSecret` from the
 *     Zod-validated env; if either is missing the provider is omitted
 *     from the providers array (so the tests don't require Google
 *     credentials at runtime).
 *
 *   - JWT session strategy. Callbacks:
 *       `jwt({ token, user })` — on first sign-in, embed
 *         `role` + `userId` onto the token from the `user` returned
 *         by `authorize`.
 *       `session({ session, token })` — project `token.role` +
 *         `token.userId` onto `session.user` so consumers (the
 *         `JwtAuthGuard` in slice 3 batch 7, the future apps/web
 *         server components in slice 4) see the canonical shape.
 *
 *   - `pages.signIn` is a locale-aware factory that points at the
 *     NextAuth v5 default sign-in page (`/api/auth/signin`). Slice 4
 *     will swap this for `/[locale]/(auth)/sign-in` once the apps/web
 *     route group ships.
 *
 * Auth.js v5 modules like `next-auth/providers/credentials` are loaded
 * as runtime values — the auto-formatter's `useImportType` heuristic
 * keeps the `Credentials` and `Google` symbols as values, not types.
 */

/**
 * Module-level AuthService singleton used by the Credentials provider's
 * `authorize` callback. Constructed lazily on first call so the import
 * of `auth.config.ts` does not pull in `@features/auth` at module
 * init (which would create a circular dep risk with the NextAuth
 * instance in `auth.ts`).
 */
let _authService: AuthService | undefined;
function authService(): AuthService {
  if (_authService === undefined) {
    _authService = new AuthService();
  }
  return _authService;
}

/**
 * Whether the Google provider is configured for this runtime. Both
 * `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be present; if
 * either is missing the provider is dropped from the providers array
 * so sign-in flows that route through the Credentials provider still
 * work in dev / test environments without OAuth credentials.
 */
function isGoogleConfigured(): boolean {
  return (
    env.GOOGLE_CLIENT_ID !== undefined &&
    env.GOOGLE_CLIENT_ID.length > 0 &&
    env.GOOGLE_CLIENT_SECRET !== undefined &&
    env.GOOGLE_CLIENT_SECRET.length > 0
  );
}

/**
 * Build the NextAuth v5 config object. Exported as a function so
 * tests can vary env (the T3.3 brief calls for `buildAuthOptions`
 * to be extracted during REFACTOR; this commit ships it directly
 * because it lets the GREEN wire env-driven branches without
 * mutating module state).
 */
export function buildAuthConfig(): NextAuthConfig {
  const baseProviders = [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * `authorize` is invoked by NextAuth when a client posts to
       * `/api/auth/callback/credentials`. Returns a User shape on
       * success (NextAuth then mints a JWT and sets the session
       * cookie); returns `null` on failure (NextAuth redirects to
       * `pages.signIn` with `error=CredentialsSignin`).
       *
       * The implementation delegates to `AuthService.login` — the
       * canonical password check. We project the LoginResult onto
       * the User shape NextAuth expects (`id`, `email`, `name`,
       * `image`). `role` is NOT a standard User field; we pass it
       * through via the `jwt` callback below.
       */
      async authorize(rawCredentials) {
        const email = rawCredentials?.["email"];
        const password = rawCredentials?.["password"];
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        try {
          const result = await authService().login(email, password);
          return {
            id: result.id,
            email: result.email,
            name: null,
            image: null,
            // Attach role onto the returned object so the `jwt`
            // callback can promote it onto the token. NextAuth
            // doesn't carry role through its standard User type;
            // the structural cast keeps the production code
            // honest without `any`.
            ...(result.role !== undefined ? { role: result.role } : {}),
          };
        } catch {
          // Per the auth spec D-AUTH-1, the user-facing message
          // for invalid creds is GENERIC — we never leak which
          // side of the credential check failed. NextAuth will
          // redirect with `error=CredentialsSignin`.
          return null;
        }
      },
    }),
  ];

  const providers = isGoogleConfigured()
    ? [
        ...baseProviders,
        Google({
          // `isGoogleConfigured` narrows these to string; the cast
          // (instead of `!`) keeps the surface honest for the
          // reader without `any` or a non-null assertion.
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          // The Google provider's authorize path is NOT exercised
          // in this batch; T3.7 ships the multi-provider test.
        }),
      ]
    : baseProviders;

  return {
    adapter: PrismaAdapter(prisma),
    session: {
      strategy: "jwt",
      maxAge: NEXTAUTH_SESSION_MAX_AGE_SECONDS,
    },
    providers,
    // Custom pages — locale-aware factory deferred to slice 4.
    // Default NextAuth v5 sign-in page (`/api/auth/signin`) is used
    // until the apps/web route group ships.
    pages: {
      signIn: "/api/auth/signin",
    },
    trustHost: true,
    secret: env.NEXTAUTH_SECRET,
    callbacks: {
      /**
       * `jwt` callback — invoked on every request that touches the
       * session cookie. On the FIRST request after sign-in, `user`
       * is populated (the return value of `authorize`); on later
       * requests `user` is undefined and `token` already carries
       * the embedded claims.
       *
       * We promote `role` + `userId` onto the token on first sign-in
       * so the `session` callback (below) can project them onto
       * `session.user` for downstream consumers.
       */
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
      /**
       * `session` callback — invoked after `jwt`. Projects the
       * token claims onto `session.user` so the guard and slice-4
       * server components see the canonical shape
       * `{ id, email, role }`.
       */
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
  };
}

/**
 * The canonical NextAuth config for this workspace. Most callers
 * should use this directly; tests that need to vary env may call
 * `buildAuthConfig()` instead.
 */
export const authConfig = buildAuthConfig();

/**
 * Salt used to derive the JWT encryption key. Exposed for the guard
 * and the test fixture so encode/decode sites never drift. Mirrors
 * `auth.constants#NEXTAUTH_SESSION_SALT`.
 */
export const authSalt = NEXTAUTH_SESSION_TOKEN_NAME;
