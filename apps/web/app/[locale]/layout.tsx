import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { routing } from "../../i18n";
import "../globals.css";

/**
 * Root layout for `apps/web` — slice 4 batch 4d (T4.10 + T4.11 + T4.12).
 *
 * Wraps every locale-prefixed route in a `NextIntlClientProvider` so
 * client components can call `useTranslations(...)` without crashing.
 * Slice 4 batches 4a (middleware) + 4b (catalogs) shipped the i18n
 * routing config + the messages catalog, but the provider wrapper was
 * intentionally deferred because no client component used `useTranslations`
 * until batch 4c (LoginForm / SignUpForm). The deferred item landed
 * alongside batch 4d because:
 *  - Without the provider, every RSC that renders a client component
 *    using `useTranslations` throws `Cannot read properties of null
 *    (reading 'useContext')` at build time during static prerendering.
 *  - The sign-in / sign-up pages (batch 4c) surface the same build
 *    failure but the apply-progress did not exercise the `next build`
 *    gate until batch 4d added the forgotten-password / reset-password
 *    pages and the dev mailbox.
 *  - Adding the provider here is the canonical next-intl App Router
 *    pattern (https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing).
 *
 * **Provider scope.** `getMessages()` returns the messages catalog for
 * the active locale (resolved by `getRequestConfig` in
 * `i18n/request.ts`). We pass it through the provider so client-side
 * `useTranslations` reads from the same source as the server-side
 * `getTranslations` — keeping the two sides in lockstep.
 *
 * **Why not also load `getMessages` from `requestLocale` directly?**
 *  - The plugin's `getRequestConfig` already caches the messages
 *    per-request. Reading via `getMessages()` (a thin wrapper over the
 *    cached value) is the canonical next-intl pattern.
 *
 * **Static prerendering.** The layout keeps `dynamic = "force-static"`
 * so the build can prerender the `en` locale at build time (per
 * `generateStaticParams`). The `es` locale is rendered on demand.
 */
interface LayoutProps {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}

export const dynamic = "force-static";

export default async function RootLayout({ children, params }: LayoutProps) {
	const { locale } = await params;

	// Defensive: if the URL prefix carries an unsupported locale (e.g.
	// `/en/...` when the layout was migrated and the old locale is still
	// in the URL), fall back to the default locale rather than letting
	// `getMessages` throw `MISSING_MESSAGE` for the entire tree.
	const safeLocale: (typeof routing.locales)[number] = (
		routing.locales as readonly string[]
	).includes(locale)
		? (locale as (typeof routing.locales)[number])
		: routing.defaultLocale;

	// `getMessages` returns the messages catalog for the resolved locale
	// (via the `getRequestConfig` wiring in `i18n/request.ts`).
	const messages = await getMessages({ locale: safeLocale });

	return (
		<html lang={safeLocale}>
			<body>
				<NextIntlClientProvider locale={safeLocale} messages={messages}>
					{children}
				</NextIntlClientProvider>
			</body>
		</html>
	);
}

export function generateStaticParams() {
	// Slice 4 expands this to the full locale list (en, es).
	return [{ locale: "en" }];
}
