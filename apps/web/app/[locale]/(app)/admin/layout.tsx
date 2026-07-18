import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/auth-server";

/**
 * (app)/admin layout — M3 Phase 4 (PR #4, task 4.4).
 *
 * Server Component. Re-checks the role guard server-side
 * (defense in depth per design §2 D1): the middleware already
 * short-circuits unauthenticated + non-admin visitors, but the
 * server-side guard is the canonical authority. If somehow a
 * non-admin reaches this layout (e.g. middleware bypass in
 * a future refactor), this layout returns `notFound()` so the
 * non-admin never sees admin copy.
 *
 * The middleware redirect for non-admins lands the user on
 * /{locale}/(app)?admin=denied — the page reads the flash and
 * renders the localized copy. The layout itself does NOT
 * render the flash; it lives on the (app) landing page so the
 * admin redirect target is shared with the (app) layout's
 * normal dashboard greeting.
 *
 * Why a layout (not a per-page guard). Same rationale as the
 * (app) layout: a single point of failure for the redirect,
 * every admin page inherits the check.
 */
interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  const session = await getSession();
  if (session === null) {
    redirect(`/${locale}/sign-in`);
  }
  if (session.user.role !== "ADMIN") {
    // Defensive: middleware already redirects non-admins, but if
    // the request somehow reaches this layout the user is bounced
    // to the (app) landing with the same `?admin=denied` flash
    // convention. The middleware-level guard is the primary
    // mechanism; this is belt-and-suspenders.
    redirect(`/${locale}/(app)?admin=denied`);
  }
  return <>{children}</>;
}
