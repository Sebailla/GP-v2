import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { env } from "@core/config/web";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import { DevMailbox } from "@/components/auth/DevMailbox";
import { readDevMailboxEvents } from "@/app/api/dev/mailbox/route";

/**
 * DevMailboxPage — slice 4 batch 4d (T4.12).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/dev/mailbox/[userId]`
 * route. **DEV-ONLY** — the first line of the function checks
 * `env.NODE_ENV !== "production"` and calls `notFound()` (Next.js
 * helper) if the check fails. Production builds therefore return 404
 * for this route, satisfying the brief's "DEV only" requirement.
 *
 * **Why the NODE_ENV check at the page boundary (not just middleware):**
 *  - The middleware (batch 4a territory) only handles locale-prefix
 *    redirects; gating the route at the page level is the canonical
 *    Next.js pattern for "this page does not exist in production".
 *  - Middleware-level gating would also work, but it would either
 *    leak the route shape in production (anyone seeing a 404 from
 *    middleware still learns that the URL pattern existed) or it
 *    would conflict with the locale-prefix routing rules.
 *  - `notFound()` throws `NEXT_NOT_FOUND` which Next.js catches and
 *    serves the `not-found.tsx` boundary (default Next.js 404 page
 *    in apps/web until batch 4e adds a custom boundary).
 *
 * **Stub events.**
 * The brief defers the real API fetch (the API doesn't expose an
 * event-replay endpoint yet — that lands in slice-5 events full
 * integration). For this batch the page reads from a module-level
 * constant `DEV_STUB_EVENTS` keyed by `userId`. The stub is clearly
 * documented inline so the next slice knows where to swap.
 *
 * **Surface guarantee.**
 * The DevMailbox component only ever renders the raw `token` (the
 * 64-char hex string). It NEVER surfaces the email body, password
 * hash, or any PII beyond the userId (which is the URL param the
 * developer already chose).
 */
interface DevMailboxPageProps {
  params: Promise<{ locale: string; userId: string }>;
}

// Force-dynamic: the dev mailbox is a development-only affordance
// that reads from a stub list (real API fetch lands in slice 5). Static
// prerendering the dynamic `[userId]` segment at build time would
// produce a 404 for every userId. Forcing dynamic rendering keeps the
// route responsive and skips the Next.js 16 ErrorBoundary issue during
// prerender of pages that render a client component using
// `useTranslations`.
export const dynamic = "force-dynamic";

/**
 * Module-2 PR #3 (task 3.9): the dev mailbox now reads from a
 * server-side in-memory ring buffer exposed by the
 * `app/api/dev/mailbox/route.ts` route. The Playwright e2e
 * (forgot-reset.spec.ts) seeds events by intercepting
 * `POST /auth/forgot-password` and calling
 * `recordDevMailboxEvent`. Real wiring against the API's
 * `InMemoryDispatcher` lands in PR #5 alongside the auth
 * runbook.
 */

export default async function DevMailboxPage({
  params,
}: DevMailboxPageProps): Promise<React.JSX.Element> {
  // DEV-ONLY gate — production builds return 404.
  if (env.NODE_ENV === "production") {
    notFound();
  }

  const { locale: _locale, userId } = await params;
  const t = await getTranslations("auth.devMailbox");

  const events = readDevMailboxEvents(userId);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "var(--ui-bg)",
      }}
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DevMailbox events={events} />
        </CardContent>
      </Card>
    </main>
  );
}
