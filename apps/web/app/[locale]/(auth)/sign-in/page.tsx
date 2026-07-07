import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { env } from "@core/config";

import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";

import { SignInClient } from "@/components/auth/SignInClient";
import { getSession } from "@/lib/auth";

/**
 * SignInPage — slice 4 batch 4c (T4.8) + slice 4 batch 2
 * (redirect-if-already-authed).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/sign-in` route.
 * The `(auth)` route group keeps the auth surface visually grouped
 * without affecting the URL — the actual URL is `/en/sign-in`
 * (or `/es/sign-in`) per the next-intl `localePrefix: 'always'`
 * policy.
 *
 * Per convention `ui-complete-not-scaffold` (Engram id 2133), this
 * page wraps the LoginForm in a Card with the title sourced from
 * the i18n catalog via `getTranslations("auth.signIn")`.
 *
 * **Slice 4 batch 2 wiring.** Before rendering the form, the page
 * calls `getSession()` to check the auth-session cookie. If a
 * session is present, the page calls `redirect(/${locale}/)` to
 * bounce the visitor to the landing. The redirect happens BEFORE
 * the form renders, so an already-authed user never sees the
 * LoginForm (and never sends the form's email / password fields
 * to the network). The check is symmetric across the 4 auth pages
 * (sign-in, sign-up, forgot, reset) for consistency.
 *
 * Page layout:
 *  - `<main>` (semantic landmark; the `(auth)` group has no layout
 *    yet, so the page owns the full vertical layout).
 *  - `<Card>` (slice 4 batch 4b primitive) with the title +
 *    description.
 *  - `<SignInClient>` (client wrapper that bridges LoginForm's
 *    `onSuccess` to `router.replace('/{locale}/')`).
 */
interface SignInPageProps {
	params: Promise<{ locale: string }>;
}

export default async function SignInPage({
	params,
}: SignInPageProps): Promise<React.JSX.Element> {
	const { locale } = await params;

	// Redirect-if-already-authenticated: an already-authed visitor
	// who lands on the sign-in page is bounced to the landing. The
	// cookie is read via the slice 4 batch 2 helper; absent /
	// malformed cookies return null, which means "not authenticated".
	const session = await getSession();
	if (session !== null) {
		redirect(`/${locale}`);
	}

	const t = await getTranslations("auth.signIn");

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
					<CardDescription>{t("description")}</CardDescription>
				</CardHeader>
				<CardContent>
					<SignInClient apiUrl={env.API_URL} locale={locale} />
				</CardContent>
			</Card>
		</main>
	);
}
