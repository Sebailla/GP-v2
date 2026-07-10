import { getTranslations } from "next-intl/server";

import { TransactionsList } from "@/components/transactions/TransactionsList";
import { ThresholdAlert } from "@/components/transactions/ThresholdAlert";

/**
 * (app)/transactions page — slice 6 (T6.4 + T6.8 + T6.9).
 *
 * Server Component. Renders the page header + the
 * `TransactionsList` client component + the `ThresholdAlert`
 * persistent banner. The (app) layout (slice 6 / T6.2) guarantees
 * a session is present.
 *
 * **Slice 6 PR-C integration.** The `ThresholdAlert` lives
 * here (top of the page) so the persistent banner is visible
 * regardless of the active filter / sort state. The
 * `TotalsCard` (T6.8) is rendered inside `TransactionsList` as
 * a header strip above the table — colocated with the list so
 * the totals track the visible filter state.
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
			<ThresholdAlert />
			<TransactionsList />
			<p style={{ color: "#999", fontSize: "0.75rem" }}>
				Locale: <code>{locale}</code>
			</p>
		</main>
	);
}
