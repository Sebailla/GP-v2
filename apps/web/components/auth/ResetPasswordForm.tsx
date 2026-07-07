"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import {
	resetPasswordSchema,
	type ResetPasswordInput,
} from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * ResetPasswordForm — slice 4 batch 4d (T4.11).
 *
 * Client component that wraps the canonical `resetPasswordSchema`
 * (from `libs/features/auth/shared/schemas/reset-password`) via
 * `react-hook-form` + the local `@/lib/zod-resolver` adapter. On
 * submit, POSTs `{ token, newPassword }` to
 * `${apiUrl}/auth/reset-password` and surfaces the result through:
 *
 *  - 200 → `router.replace('/{locale}/sign-in')` (sign-in is the
 *    destination per the spec — the user is NOT auto-signed-in;
 *    cookie storage lands in the slice-4 follow-up).
 *  - 401 → form-level banner with `auth.resetPassword.error.invalidToken`
 *    (generic copy per design §4.1 / D-AUTH-1; the server never tells
 *    the client whether the token was unknown, expired, or consumed —
 *    that's the only safe surface for password-reset).
 *  - Any other non-2xx (or network failure) → form-level banner with
 *    `auth.common.genericError`.
 *
 * Form states per the T4.11 brief:
 *  1. **Empty** — initial render, the new-password field is empty.
 *  2. **Validation-error** — Zod issue surfaces under the field.
 *  3. **Loading** — submit disabled + `auth.common.loading` label;
 *     `<form aria-busy="true">`.
 *  4. **API-error (401 / 5xx / network)** — form-level alert banner.
 *  5. **Success (200)** — client-side `router.replace('/{locale}/sign-in')`.
 *
 * The form does NOT wrap its content in a `<Card>` — the parent page
 * is responsible for the visual container (see
 * `app/[locale]/(auth)/reset-password/[token]/page.tsx`).
 */
export interface ResetPasswordFormProps {
	/** Base URL of the auth API (e.g. `http://localhost:3001`). */
	apiUrl: string;
	/**
	 * The reset token, supplied by the parent page from the dynamic
	 * route segment `[token]` (Next.js 15 async params).
	 */
	token: string;
	/**
	 * Active locale — preserved across the success-redirect so the
	 * user lands on the right localized sign-in page.
	 */
	locale: string;
	/** Optional className appended to the wrapping `<form>`. */
	className?: string;
}

export function ResetPasswordForm({
	apiUrl,
	token,
	locale,
	className,
}: ResetPasswordFormProps): React.JSX.Element {
	const t = useTranslations("auth.resetPassword");
	const tc = useTranslations("auth.common");

	const router = useRouter();

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<ResetPasswordInput>({
		resolver: zodResolver(resetPasswordSchema),
		mode: "onSubmit",
		defaultValues: { token, newPassword: "" },
	});

	const [formError, setFormError] = React.useState<string | null>(null);

	const onSubmit = handleSubmit(async (values) => {
		setFormError(null);
		let response: Response;
		try {
			response = await fetch(`${apiUrl}/auth/reset-password`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
		} catch {
			setFormError(tc("genericError"));
			return;
		}

		if (response.ok) {
			// Password reset is NOT an auto sign-in (the spec explicitly
			// redirects to /sign-in). Cookie storage lands in the slice-4
			// follow-up (T3.3 deferred).
			router.replace(`/${locale}/sign-in`);
			return;
		}

		if (response.status === 401) {
			// Generic copy per D-AUTH-1; the server never tells the client
			// why the token failed.
			setFormError(t("error.invalidToken"));
			return;
		}

		setFormError(tc("genericError"));
	});

	const newPasswordError = errors.newPassword?.message;
	const newPasswordErrorId = newPasswordError
		? "reset-password-new-password-error"
		: undefined;

	return (
		<Form
			onSubmit={onSubmit}
			aria-busy={isSubmitting}
			noValidate
			aria-describedby={formError ? "reset-password-form-error" : undefined}
			className={cn("flex flex-col gap-ui-space-4", className)}
		>
			{formError ? (
				<div
					id="reset-password-form-error"
					role="alert"
					className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
					data-testid="reset-password-form-error"
				>
					{formError}
				</div>
			) : null}

			<div className="flex flex-col gap-ui-space-1">
				<label
					htmlFor="reset-password-new-password"
					className="text-ui-text-sm font-ui-font-medium text-ui-fg"
				>
					{t("newPassword")}
				</label>
				<Input
					id="reset-password-new-password"
					type="password"
					autoComplete="new-password"
					aria-invalid={newPasswordError ? true : undefined}
					aria-describedby={newPasswordErrorId}
					disabled={isSubmitting}
					{...register("newPassword")}
				/>
				{newPasswordError ? (
					<p
						id={newPasswordErrorId}
						className="text-ui-text-sm text-ui-danger"
						data-testid="reset-password-new-password-error"
					>
						{newPasswordError}
					</p>
				) : null}
			</div>

			<Button type="submit" disabled={isSubmitting} className="self-end">
				{isSubmitting ? tc("loading") : t("submit")}
			</Button>
		</Form>
	);
}
