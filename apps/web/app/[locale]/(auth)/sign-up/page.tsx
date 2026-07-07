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

import { SignUpClient } from "@/components/auth/SignUpClient";
import { getSession } from "@/lib/auth";

/**
 * SignUpPage — slice 4 batch 4c (T4.9) + slice 4 batch 2
 * (redirect-if-already-authed).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/sign-up` route.
 * Same pattern as the sign-in page (T4.8): the `(auth)` route
 * group keeps the auth surface visually grouped without affecting
 * the URL.
 *
 * Per convention `ui-complete-not-scaffold` (Engram id 2133), this
 * page wraps the SignUpForm in a Card with the title sourced from
 * the i18n catalog via `getTranslations("auth.signUp")`.
 *
 * **Slice 4 batch 2 wiring.** Redirect-if-already-authenticated
 * short-circuit (mirrors sign-in): an already-authed visitor is
 * bounced to the landing before the SignUpForm renders. Slice 4
 * batch 2 also persists the session cookie on a 201 response, so
 * this check is reachable in practice (a user who registers, then
 * re-visits `/sign-up` directly, will be bounced instead of being
 * offered a second registration form).
 *
 * On 201 (successful registration) the SignUpClient wrapper
 * persists the session cookie + navigates to `/[locale]/sign-in`
 * (the brief explicitly chose this over the landing page — see
 * SignUpClient JSDoc).
 */
interface SignUpPageProps {
	params: Promise<{ locale: string }>;
}

export default async function SignUpPage({
	params,
}: SignUpPageProps): Promise<React.JSX.Element> {
	const { locale } = await params;

	// Redirect-if-already-authenticated (slice 4 batch 2).
	const session = await getSession();
	if (session !== null) {
		redirect(`/${locale}`);
	}

	const t = await getTranslations("auth.signUp");

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
					<SignUpClient apiUrl={env.API_URL} locale={locale} />
				</CardContent>
			</Card>
		</main>
	);
}
