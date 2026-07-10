import { getTranslations } from "next-intl/server";

import { TransactionsList } from "@/components/transactions/TransactionsList";

/**
 * (app)/transactions page — slice 6 (T6.4).
 *
 * Server Component. Renders the page header + the
 * `TransactionsList` client component. The (app) layout
 * (slice 6 / T6.2) guarantees a session is present.
 *
 * **Why the page is so thin.** The header + the (app) layout
 * carry all the i18n + auth wiring; the data + filter logic
 * lives in `TransactionsList` so the URL-state (filters in
 * query params, etc.) can be added in a follow-up without
 * touching this page.
 */
interface PageProps {
	params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations("transactions.list");
	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
			<header style={{ marginBottom: "1.5rem" }}>
				<h1>{t("title")}</h1>
				<p style={{ color: "#666" }}>{t("subtitle")}</p>
			</header>
			<TransactionsList />
			<p style={{ color: "#999", fontSize: "0.75rem" }}>
				Locale: <code>{locale}</code>
			</p>
		</main>
	);
}
