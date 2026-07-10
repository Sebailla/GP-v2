import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/auth";

/**
 * (app) route group layout — slice 6 (T6.2).
 *
 * Server Component. Reads the `authjs.session-token` cookie via
 * `getSession()` (apps/web/lib/auth.ts). If no session is present,
 * the layout redirects to the active locale's sign-in page.
 *
 * **Why a layout, not a per-page guard.** The layout is the single
 * point of failure for the redirect. Every page under `(app)/...`
 * (transactions list/create/edit, categories, sessions, dashboard)
 * inherits the guard without each page having to repeat the check.
 *
 * **Redirect target.** The `/{locale}/sign-in` route is the only entry
 * in the `(auth)` group, so the redirect lands on the canonical
 * auth surface for the user's locale.
 *
 * **Why not Next.js middleware for the guard.** next-intl's middleware
 * (apps/web/middleware.ts) already handles locale routing; adding
 * session check there would require reading the authjs cookie in
 * edge-runtime code (next-intl's middleware runs on the Edge runtime
 * which can't access `next/headers` cookies directly — the cookie
 * API is gated to Node.js RSC). Keeping the check in this layout
 * preserves the slice 4 architecture: middleware = locale routing,
 * layout = session guard, page = UI.
 *
 * **Locale handling.** `params.locale` is the locale already in the
 * URL (the middleware guarantees it's a known one). The redirect
 * preserves it so a French user on `/fr/...` lands on `/fr/sign-in`,
 * not on `/en/sign-in`.
 */
interface LayoutProps {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function AppLayout({ children, params }: LayoutProps) {
	const { locale } = await params;
	const session = await getSession();
	if (session === null) {
		// Cookie missing or expired → kick to the sign-in surface.
		// next/navigation's `redirect()` throws a `NEXT_REDIRECT` error
		// that the framework catches — control never returns from this
		// line on the unauthenticated path.
		redirect(`/${locale}/sign-in`);
	}
	return <>{children}</>;
}
