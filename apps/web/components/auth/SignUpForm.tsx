"use client";

import type * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { registerSchema, type RegisterInput } from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { AuthFormErrorBanner } from "@/components/auth/AuthFormErrorBanner";
import { FormFieldRow } from "@/components/auth/FormFieldRow";
import { useAuthApiPost } from "@/lib/useAuthApiPost";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";
import type { Session } from "@/lib/auth-server";
import { isSessionPayload } from "@/lib/auth-client";

/**
 * SignUpForm — slice 4 batch 4e (T4.15 REFACTOR) + v1.4.0 refactor.
 *
 * Refactored in batch 4e to use the shared `FormFieldRow`,
 * `AuthFormErrorBanner`, and `useAuthApiPost` hook instead of inlining
 * the label/input/error/banner/fetch boilerplate. The public contract
 * (the rendered DOM tree, the 5 form states, the i18n keys, the test
 * selectors) is byte-for-byte identical to the batch 4c shape, so the
 * existing tests continue to pass without modification.
 *
 * **v1.4.0 refactor — `setSessionCookie` removed.** Prior to v1.4.0,
 * the form persisted the session cookie client-side via
 * `document.cookie` after the API success. Real browsers silently
 * ignore the `HttpOnly` flag set via `document.cookie`, so the
 * cookie was written without the flag (JS-readable). The v1.4.0
 * `apps/api` `/auth/register` endpoint now emits the cookie via a
 * real `Set-Cookie` response header, so the form no longer needs
 * to write the cookie itself. The form just parses the API
 * response into a `Session` and notifies the parent — the cookie
 * is already on the browser by the time the success callback runs.
 */
export interface SignUpFormProps {
  /** Base URL of the auth API (e.g. `http://localhost:3001`). */
  apiUrl: string;
  /**
   * Called once the API returns 201. The API has already emitted
   * the `Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=Lax`
   * response header at this point (v1.4.0 contract), so the form
   * just decodes the API response into a `Session` (`{ token, user }`)
   * and notifies the parent for navigation — no cookie write
   * happens client-side.
   */
  onSuccess?: (session: Session) => unknown;
  /** Optional className appended to the wrapping `<form>`. */
  className?: string;
}

export function SignUpForm({ apiUrl, onSuccess, className }: SignUpFormProps): React.JSX.Element {
  const t = useTranslations("auth.signUp");
  const tc = useTranslations("auth.common");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting: rhfIsSubmitting },
    reset,
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onSubmit",
    defaultValues: { email: "", password: "", name: "" },
  });

  const {
    submit,
    isSubmitting: apiIsSubmitting,
    formError,
  } = useAuthApiPost({
    apiBaseUrl: apiUrl,
    endpoint: "/auth/register",
    errorMap: {
      409: t("error.duplicateEmail"),
    },
    onSuccess: (data) => {
      reset();
      // The API response shape is `{ id, email, role, sessionToken }`.
      // Map it to the canonical `Session` shape `{ token, user }` so
      // the parent's onSuccess can navigate without re-parsing the
      // response. The cookie was already persisted by the API's
      // `Set-Cookie` response header (v1.4.0 contract) — no client-side
      // cookie write happens here. The parent's `window.location.href`
      // triggers a hard navigation; the cookie is already on the
      // browser because the API set it before returning the 201.
      if (isSessionPayload(data)) {
        const session: Session = {
          token: data.sessionToken,
          user: { id: data.id, email: data.email, role: data.role },
        };
        onSuccess?.(session);
      }
    },
  });

  // The form is "submitting" while EITHER react-hook-form is validating
  // OR the API call is in-flight. OR'd together so the button stays
  // disabled across the whole submit → fetch → resolve window.
  const isSubmitting = rhfIsSubmitting || apiIsSubmitting;

  const onSubmit = handleSubmit(submit);

  const emailError = errors.email?.message;
  const passwordError = errors.password?.message;
  const nameError = errors.name?.message;

  return (
    <Form
      onSubmit={onSubmit}
      aria-busy={isSubmitting}
      noValidate
      aria-describedby={formError ? "signup-form-error" : undefined}
      className={cn("flex flex-col gap-ui-space-4", className)}
    >
      <AuthFormErrorBanner id="signup-form-error" message={formError} />

      <FormFieldRow
        id="signup-email"
        label={t("email")}
        type="email"
        autoComplete="email"
        error={emailError}
        registration={register("email")}
        disabled={isSubmitting}
      />

      <FormFieldRow
        id="signup-password"
        label={t("password")}
        type="password"
        autoComplete="new-password"
        error={passwordError}
        registration={register("password")}
        disabled={isSubmitting}
      />

      <FormFieldRow
        id="signup-name"
        label={t("name")}
        type="text"
        autoComplete="name"
        error={nameError}
        registration={register("name")}
        disabled={isSubmitting}
      />

      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? tc("loading") : t("submit")}
      </Button>
    </Form>
  );
}
