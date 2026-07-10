import { getTranslations } from "next-intl/server";

import { getSession } from "@/lib/auth";

/**
 * (app) route group landing page — slice 6 placeholder dashboard.
 *
 * The (app) layout (slice 6 / T6.2) guarantees a session is
 * present by the time this page renders, so `getSession()` is
 * non-null at the point of use. The page renders a minimal
 * dashboard with the user's email + a navigation entry point
 * (slice 6 follow-ups wire the transactions list, categories,
 * sessions, and totals surface).
 *
 * **Locale handling.** `t("welcome", { email })` interpolates the
 * session's email into the active locale's punctuation. The
 * `getTranslations("auth.dashboard")` namespace is the same one
 * the existing root landing uses, so the message is consistent
 * across `(app)/` and the auth-flow landing.
 *
 * **Why this page is intentionally minimal.** Slice 6 follow-ups
 * (PR-B, PR-C) add `TotalsCard`, `TransactionsList`, the
 * category manager, and the sessions list. Each component
 * lands in its own atomic commit + RED → GREEN → TRIANGULATE
 * cycle. Keeping this page empty (besides the welcome) is the
 * slice-6 foundation: the layout guard, the locale handling, and
 * the auth signal flow.
 */
interface PageProps {
	params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: PageProps) {
	const { locale } = await params;
	const session = await getSession();
	// The (app) layout's session guard guarantees `session` is
	// non-null by the time this page renders. The non-null assertion
	// is a TypeScript narrowing aid only.
	if (session === null) {
		// Defensive: if the layout's redirect somehow didn't fire, we
		// return an empty <></> rather than throwing. The user lands
		// on a blank page; Next.js will follow up with a server-render
		// pass that hits the layout's redirect path.
		return <></>;
	}
	const t = await getTranslations("auth.dashboard");
	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
			<h1>{t("welcome", { email: session.user.email })}</h1>
			<p style={{ color: "#666" }}>
				Locale: <code>{locale}</code> · slice 6 dashboard placeholder.
			</p>
			<p style={{ color: "#999", fontSize: "0.75rem" }}>
				Slice 6 follow-ups: transactions list, category manager,
				TotalsCard, sessions list.
			</p>
		</main>
	);
}
