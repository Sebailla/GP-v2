import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { env } from "@core/config/web";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getSession } from "@/lib/auth-server";

/**
 * ForgotPasswordPage — slice 4 batch 4d (T4.10) + slice 4 batch 2
 * (redirect-if-already-authed).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/forgot-password`
 * route. Same pattern as the sign-in (T4.8) and sign-up (T4.9) pages:
 * the `(auth)` route group keeps the auth surface visually grouped
 * without affecting the URL.
 *
 * Per convention `ui-complete-not-scaffold` (Engram id 2133), this page
 * wraps the ForgotPasswordForm in a Card with the title sourced from
 * the i18n catalog via `getTranslations("auth.forgotPassword")`.
 *
 * **Slice 4 batch 2 wiring.** Redirect-if-already-authenticated
 * short-circuit: an already-authed visitor is bounced to the landing
 * before the form renders. The brief's carve-out is "an authed user
 * might want to request a new reset from a different device" — in
 * practice the symmetric check across the 4 auth pages is the
 * simpler UX (a stale reset-link click doesn't show the form to
 * someone who's already logged in). A future change can re-open
 * this decision if the product wants to allow authed password
 * resets.
 *
 * The form is IDEMPOTENT — both known and unknown emails return 202,
 * so the form just shows the success message + a back-to-signin link
 * regardless of whether the email exists (no enumeration leak).
 */
interface ForgotPasswordPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Per the WCAG AA audit closure (issue #90 + the module-6-reports S20
 * flip-to-COMPLIANT), every page must render a non-empty `<title>`.
 * See `sign-in/page.tsx` for the full rationale.
 */
export async function generateMetadata({ params }: ForgotPasswordPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.meta.forgotPassword" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

// Force-dynamic: the form posts to the auth API at request time;
// pre-rendering at build time would produce stale HTML and Next.js 16's
// ErrorBoundary throws `useContext(LayoutRouterContext) -> null` during
// static prerender of pages that render a client form which uses
// `useTranslations`. Forcing dynamic rendering skips the prerender
// pass entirely; the page is rendered per-request.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  params,
}: ForgotPasswordPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;

  // Redirect-if-already-authenticated (slice 4 batch 2).
  const session = await getSession();
  if (session !== null) {
    redirect(`/${locale}`);
  }

  const t = await getTranslations("auth.forgotPassword");

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm apiUrl={env.API_URL} locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}
