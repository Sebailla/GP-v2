"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import {
	forgotPasswordSchema,
	type ForgotPasswordInput,
} from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * ForgotPasswordForm — slice 4 batch 4d (T4.10).
 *
 * Client component that wraps the canonical `forgotPasswordSchema`
 * (from `libs/features/auth/shared/schemas/forgot-password`) via
 * `react-hook-form` + the local `@/lib/zod-resolver` adapter. On
 * submit, POSTs `{ email }` to `${apiUrl}/auth/forgot-password` and
 * surfaces the result through:
 *
 *  - 202 → SUCCESS state (the success copy + a back-to-signin link).
 *    The endpoint is IDEMPOTENT per design §4.1 (no enumeration leak),
 *    so the same 202 fires whether the email is registered or not —
 *    the form never branches on email existence.
 *  - Any non-2xx (or network failure) → form-level banner with
 *    `auth.common.genericError`.
 *
 * Form states per the T4.10 brief:
 *  1. **Empty** — initial render, the email field is empty + the submit
 *     button is enabled with the `auth.forgotPassword.submit` label.
 *  2. **Loading** — submit button disabled + label swapped to
 *     `auth.common.loading`; `<form aria-busy="true">`. While in flight
 *     the form keeps its fields visible so the user can read what
 *     they entered.
 *  3. **Success** — the entire form is replaced by the success copy +
 *     a "Back to sign-in" link. The form does NOT auto-redirect: the
 *     user explicitly clicks the link when they're ready. This avoids
 *     a race where the reset email arrives faster than the redirect
 *     and the user feels rushed.
 *  4. **API-error** — form-level `<div role="alert">` banner above
 *     the field (this is the failure path of the submit attempt; the
 *     form stays mounted so the user can retry).
 *
 * Validation errors are surfaced via react-hook-form's field-level
 * errors (Zod issues surface under the email field with `aria-invalid`).
 *
 * The form does NOT wrap its content in a `<Card>` — the parent page
 * is responsible for the visual container (see
 * `app/[locale]/(auth)/forgot-password/page.tsx`). Same rationale as
 * the LoginForm (T4.1 / T4.8) and SignUpForm (T4.9): keeps the form
 * composable.
 */
export interface ForgotPasswordFormProps {
	/** Base URL of the auth API (e.g. `http://localhost:3001`). */
	apiUrl: string;
	/**
	 * Active locale — preserved on the back-to-signin link so the user
	 * lands on the right localized sign-in page.
	 */
	locale: string;
	/** Optional className appended to the wrapping `<form>`. */
	className?: string;
}

export function ForgotPasswordForm({
	apiUrl,
	locale,
	className,
}: ForgotPasswordFormProps): React.JSX.Element {
	const t = useTranslations("auth.forgotPassword");
	const tc = useTranslations("auth.common");

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<ForgotPasswordInput>({
		resolver: zodResolver(forgotPasswordSchema),
		mode: "onSubmit",
		defaultValues: { email: "" },
	});

	const [submitted, setSubmitted] = React.useState(false);
	const [formError, setFormError] = React.useState<string | null>(null);

	const onSubmit = handleSubmit(async (values) => {
		setFormError(null);
		let response: Response;
		try {
			response = await fetch(`${apiUrl}/auth/forgot-password`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
		} catch {
			setFormError(tc("genericError"));
			return;
		}

		if (response.ok) {
			// Idempotent: 202 is returned for BOTH known and unknown emails
			// (no enumeration leak). The form always transitions to success.
			setSubmitted(true);
			return;
		}

		setFormError(tc("genericError"));
	});

	const emailError = errors.email?.message;
	const emailErrorId = emailError ? "forgot-password-email-error" : undefined;

	// Success state — replaces the form. We keep the same Card outline
	// width via the parent's Card wrapper, so the layout doesn't shift.
	if (submitted) {
		return (
			<div
				className="flex flex-col gap-ui-space-4"
				role="status"
				aria-live="polite"
				data-testid="forgot-password-success"
			>
				<p className="text-ui-text-sm text-ui-fg">{t("success")}</p>
				<Link
					href={`/${locale}/sign-in`}
					className="text-ui-text-sm text-ui-accent underline-offset-4 hover:underline"
				>
					{tc("backToLoginLink")}
				</Link>
			</div>
		);
	}

	return (
		<Form
			onSubmit={onSubmit}
			aria-busy={isSubmitting}
			noValidate
			aria-describedby={formError ? "forgot-password-form-error" : undefined}
			className={cn("flex flex-col gap-ui-space-4", className)}
		>
			{formError ? (
				<div
					id="forgot-password-form-error"
					role="alert"
					className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
					data-testid="forgot-password-form-error"
				>
					{formError}
				</div>
			) : null}

			<div className="flex flex-col gap-ui-space-1">
				<label
					htmlFor="forgot-password-email"
					className="text-ui-text-sm font-ui-font-medium text-ui-fg"
				>
					{t("email")}
				</label>
				<Input
					id="forgot-password-email"
					type="email"
					autoComplete="email"
					aria-invalid={emailError ? true : undefined}
					aria-describedby={emailErrorId}
					disabled={isSubmitting}
					{...register("email")}
				/>
				{emailError ? (
					<p
						id={emailErrorId}
						className="text-ui-text-sm text-ui-danger"
						data-testid="forgot-password-email-error"
					>
						{emailError}
					</p>
				) : null}
			</div>

			<Button type="submit" disabled={isSubmitting} className="self-end">
				{isSubmitting ? tc("loading") : t("submit")}
			</Button>
		</Form>
	);
}
