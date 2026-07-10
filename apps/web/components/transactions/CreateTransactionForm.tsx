"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";

import {
	ApiError,
	createTransaction,
	listCategories,
} from "@/lib/transactions-api";
import {
	createSchema,
	type CreateTransactionInput,
} from "@features/transactions/shared/schemas";
import type { CategoryResponse } from "@/lib/transactions-api";

/**
 * CreateTransactionForm — slice 6 (T6.5).
 *
 * Client Component. Resolves the canonical `createSchema` (the same
 * Zod schema the server's POST /transactions uses) so client-side
 * validation matches server-side byte-for-byte. On submit, calls
 * `createTransaction(input)` which auto-generates the
 * `Idempotency-Key` UUID v4 and dispatches the POST. On success,
 * routes to the new transaction's edit page (so the user lands
 * in a familiar context).
 *
 * **5 form states** per the slice 4 + 6 conventions:
 *  - **loading**: categories list fetch in flight; render spinner.
 *  - **error**: form submit returned 4xx (validation) or 5xx (server).
 *  - **success**: navigate to the new transaction's edit page.
 *  - **empty**: no categories available; disable the category select
 *    and surface a "create a category first" hint.
 *  - **validation-error**: react-hook-form's resolver surfaces the
 *    schema's Zod issues; the field-level error renders below each
 *    input.
 *
 * **Currency code** uses an `<Input type="text">` rather than a
 * `<Select>` because the slice 5 server accepts any ISO 4217 code
 * (USD, ARS, EUR, etc.) and a hard-coded list would force a
 * server-side dependency. Slice 7 follow-up may swap this for a
 * server-provided currency list.
 */
export function CreateTransactionForm() {
	const t = useTranslations("transactions.new");
	const tCommon = useTranslations("common");
	const router = useRouter();

	const [categories, setCategories] = React.useState<
		| { kind: "loading" }
		| { kind: "error"; error: string }
		| { kind: "success"; items: ReadonlyArray<CategoryResponse> }
	>({ kind: "loading" });
	const [submitState, setSubmitState] = React.useState<
		| { kind: "idle" }
		| { kind: "submitting" }
		| { kind: "error"; code: string; message: string }
	>({ kind: "idle" });

	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const items = await listCategories();
				if (!cancelled) {
					setCategories({ kind: "success", items });
				}
			} catch (err) {
				if (!cancelled) {
					setCategories({
						kind: "error",
						error:
							err instanceof Error ? err.message : "Unknown error",
					});
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const form = useForm<CreateTransactionInput>({
		// The `createSchema` is a strict `ZodObject`; the
		// `zodResolver` helper expects the loose `ZodType<any>`. The
		// `as unknown as Resolver<...>` cast bridges the gap without
		// weakening the inferred type at the form field level.
		resolver: zodResolver(
			createSchema as unknown as Parameters<typeof zodResolver>[0],
		) as unknown as Resolver<CreateTransactionInput>,
		defaultValues: {
			amount: "0.00",
			currencyCode: "USD",
			kind: "expense",
			categoryId: "",
			notes: undefined,
			occurredAt: new Date(),
		},
		mode: "onBlur",
	});

	const onSubmit = form.handleSubmit(async (values) => {
		setSubmitState({ kind: "submitting" });
		try {
			const created = await createTransaction(values);
			router.push(`/transactions/${created.id}`);
		} catch (err) {
			if (err instanceof ApiError) {
				setSubmitState({
					kind: "error",
					code: err.code,
					message: err.message,
				});
			} else {
				setSubmitState({
					kind: "error",
					code: "UNKNOWN",
					message: err instanceof Error ? err.message : "Unknown",
				});
			}
		}
	});

	if (categories.kind === "loading") {
		return <p style={{ color: "#666" }}>{tCommon("loading")}</p>;
	}
	if (categories.kind === "error") {
		return (
			<div role="alert" style={{ color: "#b91c1c" }}>
				<span>{categories.error}</span>
			</div>
		);
	}
	if (categories.items.length === 0) {
		return (
			<div
				style={{
					padding: "1rem",
					border: "1px solid #fcd34d",
					borderRadius: "0.375rem",
				}}
			>
				<p>No categories yet.</p>
				<button
					type="button"
					onClick={() => router.push("/categories")}
					style={{
						background: "none",
						border: "none",
						color: "#2563eb",
						cursor: "pointer",
						padding: 0,
						textDecoration: "underline",
					}}
				>
					Create one first
				</button>
			</div>
		);
	}

	return (
		<form
			onSubmit={onSubmit}
			style={{ display: "grid", gap: "1rem", maxWidth: "32rem" }}
		>
			<FormField
				label={t("amount")}
				error={form.formState.errors.amount?.message}
			>
				<Input
					type="text"
					inputMode="decimal"
					{...form.register("amount")}
				/>
			</FormField>
			<FormField
				label={t("currency")}
				error={form.formState.errors.currencyCode?.message}
			>
				<Input
					type="text"
					maxLength={3}
					{...form.register("currencyCode")}
				/>
			</FormField>
			<FormField label={t("kind")} error={form.formState.errors.kind?.message}>
				<Select
					value={form.watch("kind")}
					onValueChange={(value) => {
						if (value === "income" || value === "expense") {
							form.setValue("kind", value, { shouldValidate: true });
						}
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="expense">{t("kind.expense")}</SelectItem>
						<SelectItem value="income">{t("kind.income")}</SelectItem>
					</SelectContent>
				</Select>
			</FormField>
			<FormField
				label={t("category")}
				error={form.formState.errors.categoryId?.message}
			>
				<Select
					value={form.watch("categoryId")}
					onValueChange={(value) => {
						form.setValue("categoryId", value, { shouldValidate: true });
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{categories.items.map((cat) => (
							<SelectItem key={cat.id} value={cat.id}>
								{cat.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FormField>
			<FormField
				label={t("occurredAt")}
				error={form.formState.errors.occurredAt?.message}
			>
				<Input
					type="date"
					value={formatDate(form.watch("occurredAt"))}
					onChange={(e) => {
						const next = new Date(e.target.value);
						if (!Number.isNaN(next.getTime())) {
							form.setValue("occurredAt", next, { shouldValidate: true });
						}
					}}
				/>
			</FormField>
			<FormField
				label={t("notes")}
				error={form.formState.errors.notes?.message}
			>
				<Input type="text" maxLength={500} {...form.register("notes")} />
			</FormField>

			{submitState.kind === "error" && (
				<div
					role="alert"
					style={{
						padding: "0.75rem",
						background: "#fee2e2",
						border: "1px solid #fca5a5",
						borderRadius: "0.375rem",
					}}
				>
					<strong>{submitState.code}</strong>:{" "}
					<span>{submitState.message}</span>
				</div>
			)}

			<div style={{ display: "flex", gap: "0.5rem" }}>
				<Button
					type="submit"
					disabled={submitState.kind === "submitting"}
				>
					{submitState.kind === "submitting" ? tCommon("loading") : t("submit")}
				</Button>
				<Button type="button" variant="ghost" onClick={() => router.back()}>
					{tCommon("cancel")}
				</Button>
			</div>
		</form>
	);
}

function FormField({
	label,
	error,
	children,
}: {
	label: string;
	error: string | undefined;
	children: React.ReactNode;
}) {
	return (
		<div style={{ display: "grid", gap: "0.25rem" }}>
			<label style={{ fontSize: "0.875rem", fontWeight: 500 }}>{label}</label>
			{children}
			{error && (
				<p
					role="alert"
					style={{ color: "#b91c1c", fontSize: "0.75rem" }}
				>
					{error}
				</p>
			)}
		</div>
	);
}

function formatDate(d: Date | string | undefined): string {
	if (!d) {
		return "";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toISOString().slice(0, 10);
}
