"use client";

import type * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import {
  registerSchema,
  type RegisterInput,
} from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { AuthFormErrorBanner } from "@/components/auth/AuthFormErrorBanner";
import { FormFieldRow } from "@/components/auth/FormFieldRow";
import { useAuthApiPost } from "@/lib/useAuthApiPost";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * SignUpForm — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Refactored in batch 4e to use the shared `FormFieldRow`,
 * `AuthFormErrorBanner`, and `useAuthApiPost` hook instead of inlining
 * the label/input/error/banner/fetch boilerplate. The public contract
 * (the rendered DOM tree, the 5 form states, the i18n keys, the test
 * selectors) is byte-for-byte identical to the batch 4c shape, so the
 * existing tests continue to pass without modification.
 */
export interface SignUpFormProps {
  /** Base URL of the auth API (e.g. `http://localhost:3001`). */
  apiUrl: string;
  /**
   * Called once the API returns 201. The parent page wires this to the
   * locale-aware `router.replace('/sign-in')` so a freshly-registered
   * user lands on the sign-in screen to authenticate (per the brief:
   * redirect to sign-in on success — NOT auto-sign-in, since the
   * cookie storage is deferred).
   */
  onSuccess?: () => unknown;
  /** Optional className appended to the wrapping `<form>`. */
  className?: string;
}

export function SignUpForm({
  apiUrl,
  onSuccess,
  className,
}: SignUpFormProps): React.JSX.Element {
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

  const { submit, isSubmitting: apiIsSubmitting, formError } = useAuthApiPost({
    apiBaseUrl: apiUrl,
    endpoint: "/auth/register",
    errorMap: {
      409: t("error.duplicateEmail"),
    },
    onSuccess: () => {
      reset();
      onSuccess?.();
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