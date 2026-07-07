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
import { isSessionPayload, setSessionCookie } from "@/lib/auth";
import type { Session } from "@/lib/auth";

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
   * Called once the API returns 201. The form persists the session
   * via `setSessionCookie(session)` BEFORE calling this callback so
   * the freshly-registered user is technically authenticated for the
   * brief window between registration and the sign-in screen
   * (the parent uses `window.location.href` to navigate, which is
   * a hard navigation — the cookie MUST be set first or the
   * landing's redirect-if-already-authenticated check on the next
   * page load will see a logged-out user).
   */
  onSuccess?: (session: Session) => unknown;
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
    onSuccess: (data) => {
      reset();
      // The API response shape is `{ id, email, role, sessionToken }`.
      // Map it to the canonical `Session` shape `{ token, user }` so
      // the parent's onSuccess can navigate without re-parsing the
      // response. The form ALSO persists the cookie here (before
      // calling the parent) — see SignUpFormProps#onSuccess JSDoc
      // for the rationale (the parent's `window.location.href`
      // triggers a hard navigation; the cookie must be on disk
      // first).
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