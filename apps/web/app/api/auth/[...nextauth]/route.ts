import { handlers } from "../../../../auth";

/**
 * NextAuth v5 route handler — slice 4 NextAuth integration follow-up
 * (brief-web-nextauth-config).
 *
 * Per the [official NextAuth v5 installation guide](https://authjs.dev/getting-started/installation),
 * a Next.js App Router app exposes the NextAuth handlers via a
 * catch-all route at `app/api/auth/[...nextauth]/route.ts`. This file
 * re-exports the GET + POST handlers from the NextAuth instance
 * minted in `apps/web/auth.ts` so NextAuth can serve:
 *
 *  - `/api/auth/signin` (the default NextAuth sign-in page).
 *  - `/api/auth/signout`.
 *  - `/api/auth/session` (returns the active session as JSON).
 *  - `/api/auth/csrf` (returns the CSRF token for sign-in flows).
 *  - `/api/auth/callback/<provider>` (the OAuth callback endpoints
 *    when a real provider is added in slice 5+).
 *
 * The web client in this batch does NOT use NextAuth's signIn flow
 * (the API already verified credentials and minted the JWT; the
 * form writes the cookie directly). The handler is wired so a
 * future slice (e.g. real Google OAuth in slice 5+) can swap the
 * form's cookie-set step for `signIn('google')` without a config
 * change.
 *
 * The next-intl middleware (apps/web/middleware.ts) excludes the
 * `/api` prefix from locale routing, so this route is NOT
 * locale-prefixed.
 */
export const { GET, POST } = handlers;
