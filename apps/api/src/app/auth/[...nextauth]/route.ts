import { handlers } from "../../../lib/auth.js";

/**
 * NextAuth v5 route handler — T3.3 (slice 3 batch 7).
 *
 * Per the [official NextAuth v5 installation guide](https://authjs.dev/getting-started/installation),
 * a Next.js App Router app exposes the auth handlers via a
 * catch-all route file at `app/api/auth/[...nextauth]/route.ts`. This
 * file re-exports the GET and POST handlers from the NextAuth
 * instance so NextAuth can serve the OAuth callback URLs, the
 * sign-in page, the session endpoint, etc.
 *
 * The reference repo's API app (`apps/api`) is NestJS, not Next.js.
 * NestJS handles its own routing via `@Controller(...)` decorators —
 * the auth controller at `apps/api/src/modules/auth/auth.controller.ts`
 * owns the 6 design-§4.1 endpoints (login / register / forgot-password /
 * reset-password / sessions / sessions/:id). This file therefore does
 * NOT receive real traffic in the slice-3 NestJS deployment.
 *
 * Why ship the file anyway:
 *
 *   1. The brief's T3.3 deliverable list explicitly names
 *      `apps/api/src/app/auth/[...nextauth]/route.ts`. Shipping it
 *      keeps the workspace layout aligned with the NextAuth v5 docs
 *      so a future operator grepping the repo finds the canonical
 *      handler file where the docs say it should be.
 *
 *   2. Slice 4 (apps/web) is the canonical NextAuth consumer; that
 *      app will host its own equivalent route file. Keeping this
 *      mirror in apps/api means a developer porting the auth slice
 *      from one runtime to the other doesn't have to chase the
 *      difference.
 *
 *   3. If a future change routes any auth traffic through this
 *      NestJS app (e.g. the slice 4 web app delegates OAuth callbacks
 *      to the API for cross-origin reasons), the file is already
 *      wired to re-export the handlers — the operator only needs to
 *      mount it.
 *
 * The handlers are exported with `as unknown` casts to avoid
 * surfacing Next.js-specific types (`NextRequest` / `NextResponse`)
 * in the API app's public surface — those types belong to slice 4.
 */

export const { GET, POST } = {
	GET: handlers.GET,
	POST: handlers.POST,
} as unknown as {
	GET: unknown;
	POST: unknown;
} as {
	GET: (request: unknown) => Promise<Response>;
	POST: (request: unknown) => Promise<Response>;
};