"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { AuthFormErrorBanner } from "@/components/auth/AuthFormErrorBanner";
import { FormFieldRow } from "@/components/auth/FormFieldRow";
import { useAuthApiPost } from "@/lib/useAuthApiPost";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * ResetPasswordForm — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Refactored in batch 4e to use the shared `FormFieldRow`,
 * `AuthFormErrorBanner`, and `useAuthApiPost` hook instead of inlining
 * the label/input/error/banner/fetch boilerplate. The public contract
 * (the rendered DOM tree, the form states, the i18n keys, the test
 * selectors) is byte-for-byte identical to the batch 4d shape, so the
 * existing tests continue to pass without modification.
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
    formState: { errors, isSubmitting: rhfIsSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onSubmit",
    defaultValues: { token, newPassword: "" },
  });

  const { submit, isSubmitting: apiIsSubmitting, formError } = useAuthApiPost({
    apiBaseUrl: apiUrl,
    endpoint: "/auth/reset-password",
    errorMap: {
      401: t("error.invalidToken"),
    },
    onSuccess: () => {
      // Password reset is NOT an auto sign-in (the spec explicitly
      // redirects to /sign-in). Cookie storage lands in the slice-4
      // follow-up (T3.3 deferred).
      router.replace(`/${locale}/sign-in`);
    },
  });

  const isSubmitting = rhfIsSubmitting || apiIsSubmitting;
  const onSubmit = handleSubmit(submit);
  const newPasswordError = errors.newPassword?.message;

  return (
    <Form
      onSubmit={onSubmit}
      aria-busy={isSubmitting}
      noValidate
      aria-describedby={formError ? "reset-password-form-error" : undefined}
      className={cn("flex flex-col gap-ui-space-4", className)}
    >
      <AuthFormErrorBanner
        id="reset-password-form-error"
        message={formError}
      />

      <FormFieldRow
        id="reset-password-new-password"
        label={t("newPassword")}
        type="password"
        autoComplete="new-password"
        error={newPasswordError}
        registration={register("newPassword")}
        disabled={isSubmitting}
      />

      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? tc("loading") : t("submit")}
      </Button>
    </Form>
  );
}