import { getTranslations } from "next-intl/server";
import { env } from "@core/config";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

/**
 * ForgotPasswordPage — slice 4 batch 4d (T4.10).
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
 * The form is IDEMPOTENT — both known and unknown emails return 202,
 * so the form just shows the success message + a back-to-signin link
 * regardless of whether the email exists (no enumeration leak).
 */
interface ForgotPasswordPageProps {
	params: Promise<{ locale: string }>;
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
