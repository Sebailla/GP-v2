import { getTranslations } from "next-intl/server";
import { env } from "@core/config";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

/**
 * ResetPasswordPage — slice 4 batch 4d (T4.11).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/reset-password/[token]`
 * route. The page reads the `token` from the dynamic route segment per
 * Next.js 15 async params.
 *
 * Per convention `ui-complete-not-scaffold` (Engram id 2133), this page
 * wraps the ResetPasswordForm in a Card with the title sourced from the
 * i18n catalog via `getTranslations("auth.resetPassword")`.
 *
 * On 200 (successful reset) the form calls
 * `router.replace('/{locale}/sign-in')` (the page preserves the active
 * locale). The user is NOT auto-signed-in — cookie storage lands in
 * the slice-4 follow-up alongside the NextAuth client config.
 */
interface ResetPasswordPageProps {
	params: Promise<{ locale: string; token: string }>;
}

// Force-dynamic: same rationale as the forgot-password page (see
// `app/[locale]/(auth)/forgot-password/page.tsx`). Static prerendering
// the dynamic `[token]` segment at build time would produce a 404 for
// every token + would also trip the Next.js 16 ErrorBoundary issue
// (`useContext(LayoutRouterContext) -> null` during prerender of
// pages that render a client form which uses `useTranslations`).
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
	params,
}: ResetPasswordPageProps): Promise<React.JSX.Element> {
	const { locale, token } = await params;
	const t = await getTranslations("auth.resetPassword");

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
					<ResetPasswordForm
						apiUrl={env.API_URL}
						token={token}
						locale={locale}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
