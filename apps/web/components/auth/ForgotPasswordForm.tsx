"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { forgotPasswordSchema, type ForgotPasswordInput } from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { AuthFormErrorBanner } from "@/components/auth/AuthFormErrorBanner";
import { FormFieldRow } from "@/components/auth/FormFieldRow";
import { useAuthApiPost } from "@/lib/useAuthApiPost";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * ForgotPasswordForm — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Refactored in batch 4e to use the shared `FormFieldRow`,
 * `AuthFormErrorBanner`, and `useAuthApiPost` hook instead of inlining
 * the label/input/error/banner/fetch boilerplate. The public contract
 * (the rendered DOM tree, the form states, the i18n keys, the test
 * selectors) is byte-for-byte identical to the batch 4d shape, so the
 * existing tests continue to pass without modification.
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
    formState: { errors, isSubmitting: rhfIsSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onSubmit",
    defaultValues: { email: "" },
  });

  const [submitted, setSubmitted] = React.useState(false);
  const {
    submit,
    isSubmitting: apiIsSubmitting,
    formError,
  } = useAuthApiPost({
    apiBaseUrl: apiUrl,
    endpoint: "/auth/forgot-password",
    errorMap: {},
    onSuccess: () => {
      // Idempotent: 202 is returned for BOTH known and unknown emails
      // (no enumeration leak). The form always transitions to success.
      setSubmitted(true);
    },
  });

  const isSubmitting = rhfIsSubmitting || apiIsSubmitting;
  const onSubmit = handleSubmit(submit);
  const emailError = errors.email?.message;

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
      <AuthFormErrorBanner id="forgot-password-form-error" message={formError} />

      <FormFieldRow
        id="forgot-password-email"
        label={t("email")}
        type="email"
        autoComplete="email"
        error={emailError}
        registration={register("email")}
        disabled={isSubmitting}
      />

      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? tc("loading") : t("submit")}
      </Button>
    </Form>
  );
}
