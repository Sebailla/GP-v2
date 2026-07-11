import NextAuth from "next-auth";

import { authConfig } from "./auth.config.js";

/**
 * NextAuth v5 instance — T3.3 (slice 3 batch 7).
 *
 * Per the [official NextAuth v5 installation guide](https://authjs.dev/getting-started/installation),
 * a Next.js app exposes the auth handlers + helpers by exporting from
 * a top-level `auth.ts` module:
 *
 *   export const { handlers, auth, signIn, signOut } = NextAuth(authConfig); // docs-only snippet, not the actual export
 *
 * The reference repo's API app (`apps/api`) is NestJS, not Next.js —
 * so the standard `auth()` helper (which depends on Next.js's
 * `headers()` + `cookies()` globals) is NOT directly usable inside
 * NestJS guards. We still export the canonical `handlers` / `auth` /
 * `signIn` / `signOut` quadruple because:
 *
 *   1. Slice 4 (apps/web) is the canonical consumer. The web app's
 *      server components + middleware will import this module to
 *      read the session.
 *
 *   2. The NestJS guard uses the lower-level `@auth/core/jwt#decode`
 *      directly (see `apps/api/src/shared/guards/jwt.guard.ts`) so
 *      it does NOT need Next.js globals. The guard reads the bearer
 *      JWT from the `Authorization` header, decodes it with the same
 *      `secret` + `salt` as this instance, and projects the claims
 *      onto the canonical `CurrentUser` shape.
 *
 *   3. The `handlers` export is consumed by the NextAuth route
 *      placeholder at `apps/api/src/app/auth/[...nextauth]/route.ts`.
 *      The placeholder is a Next.js App Router file that ships with
 *      T3.3 per the brief; NestJS routing does not use it, but the
 *      file is the canonical NextAuth v5 entry shape and must exist
 *      so the config is import-clean for slice 4.
 *
 * Auto-formatter note: NextAuth v5's `NextAuth(config)` returns an
 * object whose fields (handlers / auth / signIn / signOut) are RUNTIME
 * values, not types. The auto-formatter's `useImportType` heuristic
 * preserves this import as a value-import because we reference the
 * factory on the right-hand side of the export below.
 */
// Explicit return-type annotation avoids the auto-formatter's portability
// flag — the destructured types include `NextRequest` /
// `GetServerSidePropsContext` from `next/server` and `next`, neither
// of which the API app depends on. Annotating here keeps the export
// shape canonical for slice 4 (apps/web is a Next.js app and will
// resolve those types locally). The annotation uses a structural
// shape rather than `ReturnType<typeof NextAuth>` because NextAuth's
// factory is a value, not a generic class.
type NextAuthExport = {
  handlers: { GET: unknown; POST: unknown };
  auth: unknown;
  signIn: unknown;
  signOut: unknown;
};

const _nextAuth: NextAuthExport = NextAuth(authConfig);
export const { handlers, auth, signIn, signOut } = _nextAuth;
