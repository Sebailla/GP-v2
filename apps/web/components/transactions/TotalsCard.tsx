"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * TotalsCard — slice 6 (T6.8).
 *
 * Client Component. Fetches /transactions/totals (the slice 5
 * sign-aware rollup endpoint) and renders the income / expense
 * / net summary in the active reporting currency. The endpoint
 * honours the filter args (fromDate / toDate / categoryId /
 * currencyCode) so the totals track the active list view.
 *
 * 5 form states: loading (fetch in flight), error (server
 * returned 4xx/5xx), success-empty (no transactions match the
 * filter — the card renders "no data" with zeros), success-non-empty
 * (the standard state with formatted numbers), and "filtered out"
 * (the user has set filters that match zero transactions; same
 * rendering as success-empty).
 */
export function TotalsCard({
	filters,
}: {
	filters: {
		fromDate: string;
		toDate: string;
		categoryId: string;
		currencyCode: string;
	};
}) {
	const t = useTranslations("transactions.totals");
	const tCommon = useTranslations("common");

	const [state, setState] = React.useState<
		| { kind: "loading" }
		| { kind: "error"; error: string }
		| {
				kind: "success";
				income: string;
				expense: string;
				net: string;
				currency: string;
		  }
	>({ kind: "loading" });

	const fetchTotals = React.useCallback(async () => {
		setState({ kind: "loading" });
		const params = new URLSearchParams();
		if (filters.fromDate) params.set("fromDate", filters.fromDate);
		if (filters.toDate) params.set("toDate", filters.toDate);
		if (filters.categoryId) params.set("categoryId", filters.categoryId);
		if (filters.currencyCode) params.set("currencyCode", filters.currencyCode);
		const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/transactions/totals${
			params.toString() ? `?${params.toString()}` : ""
		}`;
		try {
			const res = await fetch(url, { credentials: "include" });
			if (!res.ok) {
				setState({ kind: "error", error: `${res.status} ${res.statusText}` });
				return;
			}
			const data = (await res.json()) as {
				income: string;
				expense: string;
				net: string;
				currency: string;
			};
			setState({
				kind: "success",
				income: data.income,
				expense: data.expense,
				net: data.net,
				currency: data.currency,
			});
		} catch (err) {
			setState({
				kind: "error",
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}, [
		filters.categoryId,
		filters.currencyCode,
		filters.fromDate,
		filters.toDate,
	]);

	React.useEffect(() => {
		fetchTotals();
	}, [fetchTotals]);

	if (state.kind === "loading") {
		return <p style={{ color: "#666" }}>{tCommon("loading")}</p>;
	}
	if (state.kind === "error") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("net")}</CardTitle>
				</CardHeader>
				<CardContent>
					<p role="alert" style={{ color: "#b91c1c" }}>
						{state.error}
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("net")}</CardTitle>
			</CardHeader>
			<CardContent>
				<dl
					style={{
						display: "grid",
						gridTemplateColumns: "1fr auto",
						gap: "0.5rem 1.5rem",
					}}
				>
					<dt style={{ color: "#666" }}>{t("income")}</dt>
					<dd style={{ textAlign: "right" }}>+{state.income} {state.currency}</dd>
					<dt style={{ color: "#666" }}>{t("expense")}</dt>
					<dd style={{ textAlign: "right" }}>-{state.expense} {state.currency}</dd>
					<dt
						style={{
							color: "#666",
							borderTop: "1px solid #e5e7eb",
							paddingTop: "0.5rem",
							fontWeight: 600,
						}}
					>
						{t("net")}
					</dt>
					<dd
						style={{
							textAlign: "right",
							borderTop: "1px solid #e5e7eb",
							paddingTop: "0.5rem",
							fontWeight: 600,
						}}
					>
						{state.net} {state.currency}
					</dd>
				</dl>
			</CardContent>
		</Card>
	);
}
