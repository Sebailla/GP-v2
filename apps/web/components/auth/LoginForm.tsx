"use client";

import type * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { loginSchema, type LoginInput } from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { AuthFormErrorBanner } from "@/components/auth/AuthFormErrorBanner";
import { FormFieldRow } from "@/components/auth/FormFieldRow";
import { useAuthApiPost } from "@/lib/useAuthApiPost";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";
import { isSessionPayload, setSessionCookie } from "@/lib/auth";
import type { Session } from "@/lib/auth";

/**
 * LoginForm — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Refactored in batch 4e to use the shared `FormFieldRow`,
 * `AuthFormErrorBanner`, and `useAuthApiPost` hook instead of inlining
 * the label/input/error/banner/fetch boilerplate. The public contract
 * (the rendered DOM tree, the 5 form states, the i18n keys, the test
 * selectors) is byte-for-byte identical to the batch 4c shape, so the
 * existing tests continue to pass without modification.
 *
 * Five form states per convention `ui-complete-not-scaffold` (id 2133):
 *  1. **Empty** — both fields empty, no error.
 *  2. **Validation-error** — Zod issues surface under each field via
 *     `aria-invalid` + a sibling message node.
 *  3. **Loading** — submit button disabled + label swapped to
 *     `auth.common.loading`; `<form aria-busy="true">`.
 *  4. **API-error** — form-level `<div role="alert">` banner above the
 *     fields.
 *  5. **Success** — `onSuccess` fires; the parent unmounts the form.
 */
export interface LoginFormProps {
	/** Base URL of the auth API (e.g. `http://localhost:3001`). */
	apiUrl: string;
	/**
	 * Called once the API returns 200. The form persists the session
	 * via `setSessionCookie(session)` BEFORE calling this callback so
	 * the user is technically authenticated across a hard reload. The
	 * form passes the decoded `Session` (`{ token, user }`) so the
	 * parent (SignInClient) can navigate without re-parsing the API
	 * response.
	 */
	onSuccess?: (session: Session) => unknown;
	/**
	 * Optional className appended to the wrapping `<form>` (kept narrow —
	 * the page owns layout, this form owns structure + semantics).
	 */
	className?: string;
}

export function LoginForm({
	apiUrl,
	onSuccess,
	className,
}: LoginFormProps): React.JSX.Element {
	const t = useTranslations("auth.signIn");
	const tc = useTranslations("auth.common");

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting: rhfIsSubmitting },
		reset,
	} = useForm<LoginInput>({
		resolver: zodResolver(loginSchema),
		mode: "onSubmit",
		defaultValues: { email: "", password: "" },
	});

	const {
		submit,
		isSubmitting: apiIsSubmitting,
		formError,
	} = useAuthApiPost({
		apiBaseUrl: apiUrl,
		endpoint: "/auth/login",
		errorMap: {
			401: t("error.invalidCredentials"),
		},
		onSuccess: (data) => {
			reset();
			// The API response shape is `{ id, email, role, sessionToken }`.
			// Map it to the canonical `Session` shape `{ token, user }` so
			// the parent (SignInClient) can navigate without re-parsing the
			// response. The form ALSO persists the cookie here (before
			// calling the parent) — the same pattern as SignUpForm. The
			// parent's `router.replace` is a soft navigation; persisting
			// the cookie first means a hard reload between the API
			// success and the redirect (e.g. browser refresh) still lands
			// on the authenticated landing instead of bouncing back to
			// sign-in.
			if (isSessionPayload(data)) {
				const session: Session = {
					token: data.sessionToken,
					user: { id: data.id, email: data.email, role: data.role },
				};
				setSessionCookie(session);
				onSuccess?.(session);
			}
		},
	});

	// The form is "submitting" while EITHER react-hook-form is validating
	// (the brief moment between submit and resolution) OR the API call is
	// in-flight. We OR the two flags so the button stays disabled across
	// the whole submit → fetch → resolve window.
	const isSubmitting = rhfIsSubmitting || apiIsSubmitting;

	const onSubmit = handleSubmit(submit);

	const emailError = errors.email?.message;
	const passwordError = errors.password?.message;

	return (
		<Form
			onSubmit={onSubmit}
			aria-busy={isSubmitting}
			noValidate
			aria-describedby={formError ? "login-form-error" : undefined}
			className={cn("flex flex-col gap-ui-space-4", className)}
		>
			<AuthFormErrorBanner id="login-form-error" message={formError} />

			<FormFieldRow
				id="login-email"
				label={t("email")}
				type="email"
				autoComplete="email"
				error={emailError}
				registration={register("email")}
				disabled={isSubmitting}
			/>

			<FormFieldRow
				id="login-password"
				label={t("password")}
				type="password"
				autoComplete="current-password"
				error={passwordError}
				registration={register("password")}
				disabled={isSubmitting}
			/>

			<Button type="submit" disabled={isSubmitting} className="self-end">
				{isSubmitting ? tc("loading") : t("submit")}
			</Button>
		</Form>
	);
}
