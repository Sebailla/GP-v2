/**
 * apps/web/lib/auth.ts — slice 7 server/client split.
 *
 * This file is now a thin re-export barrel for `auth-server.ts`
 * (server-only `getSession()` + `next/headers#cookies` decoder)
 * and `auth-client.ts` (browser-only `setSessionCookie` /
 * `clearSessionCookie` via `document.cookie`). The split lets the
 * Next.js bundler correctly classify each function as server- or
 * client-only; the original monolithic `auth.ts` triggered the
 * "next/headers import is only valid in Server Components in the
 * App Router, but you are using it in the Pages Router" build
 * error because `next/headers` was being bundled into both the
 * server and the client tree.
 *
 * **Backward compatibility.** Every export the previous
 * monolithic `auth.ts` shipped (types + functions + constants) is
 * re-exported here, so existing call sites like
 * `import { getSession } from "@/lib/auth"` keep working without
 * a refactor. Slice 6+ follow-ups can migrate to the explicit
 * server- / client-specific paths (`@/lib/auth-server`,
 * `@/lib/auth-client`) for build-time clarity.
 *
 * **Why a barrel + two implementation files.** The split is a
 * build-system concern (which files the bundler treats as
 * server- vs client-only) and the runtime behavior is unchanged.
 * The barrel keeps the import surface stable so slice 6's
 * `(app)/layout.tsx` and the slice 4 auth forms keep working
 * without touching them.
 */

export {
	SESSION_TTL_SECONDS,
	AUTH_SESSION_COOKIE,
	type Session,
	decodeSession,
	getSession,
	type SessionPayload,
	isSessionPayload,
} from "./auth-server.js";
export { setSessionCookie, clearSessionCookie } from "./auth-client.js";
