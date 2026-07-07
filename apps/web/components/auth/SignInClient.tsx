"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "./LoginForm";

/**
 * SignInClient — slice 4 batch 4c (T4.8) + slice 4 batch 2
 * (cookie-on-success).
 *
 * Thin client wrapper that bridges the LoginForm's `onSuccess`
 * callback to a `next/navigation#useRouter#replace` redirect. The
 * `redirect()` helper from `next/navigation` is server-only, so the
 * redirect must happen client-side after the API returns 200.
 *
 * **Slice 4 batch 2 wiring.** The LoginForm (slice 4 batch 2) is
 * responsible for persisting the session via `setSessionCookie`
 * before calling `onSuccess(session)`. The wrapper therefore just
 * navigates; the cookie is already on disk by the time
 * `router.replace` resolves. The same pattern applies to
 * SignUpClient + SignUpForm (the form persists the cookie, the
 * wrapper navigates).
 *
 * `router.replace` is preferred over `router.push` so the sign-in
 * URL is replaced in the history stack — the user can't navigate
 * back to the form after authenticating.
 *
 * The locale is passed from the page (server component) because
 * `useParams()` is also client-only and would force the page to
 * be a client component (losing the ability to call
 * `getTranslations` from `next-intl/server`).
 */
export interface SignInClientProps {
	/** Base URL of the API — sourced from `env.API_URL` at the page level. */
	apiUrl: string;
	/** Active locale — preserved across the redirect (e.g. `en` or `es`). */
	locale: string;
}

export function SignInClient({
	apiUrl,
	locale,
}: SignInClientProps): React.JSX.Element {
	const router = useRouter();
	return (
		<LoginForm
			apiUrl={apiUrl}
			onSuccess={() => {
				router.replace(`/${locale}`);
			}}
		/>
	);
}
