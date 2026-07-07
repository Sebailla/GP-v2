"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import {
  registerSchema,
  type RegisterInput,
} from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * SignUpForm — slice 4 batch 4c (T4.9).
 *
 * Client component that wraps the canonical `registerSchema`
 * (from `libs/features/auth/shared/schemas/register`) via
 * `react-hook-form` + the local `@/lib/zod-resolver` adapter. On
 * submit, POSTs `{ email, password, name }` to
 * `${apiUrl}/auth/register` and surfaces the result through:
 *
 *  - `onSuccess()` — 201 → the parent page triggers the redirect.
 *  - 409 → form-level banner with `auth.signUp.error.duplicateEmail`.
 *  - 400 → form-level banner with `auth.common.genericError`
 *    (Zod validation already runs client-side via the resolver; a
 *    400 here means the server saw something the client missed).
 *  - Other non-2xx or network failure → `auth.common.genericError`.
 *
 * Five form states per convention `ui-complete-not-scaffold` (id 2133):
 *  1. **Empty** — all 3 fields empty, no error.
 *  2. **Validation-error** — Zod issues surface under each field via
 *     `aria-invalid` + a sibling message node.
 *  3. **Loading** — submit button disabled + label swapped to
 *     `auth.common.loading`; `<form aria-busy="true">`.
 *  4. **API-error** — form-level `<div role="alert">` banner above the
 *     fields.
 *  5. **Success** — `onSuccess` fires; the parent unmounts the form.
 *
 * The form does NOT wrap its content in a `<Card>` — the parent page
 * is responsible for the visual container (see
 * `app/[locale]/(auth)/sign-up/page.tsx`). Same rationale as the
 * LoginForm (T4.1 / T4.8): keeps the form composable.
 *
 * The session token returned by POST /auth/register is NOT stored
 * — cookie storage lands alongside the NextAuth client config
 * (T3.3 deferred). The success path simply notifies the parent;
 * the user is NOT actually authenticated across reloads in this
 * batch.
 */
export interface SignUpFormProps {
  /** Base URL of the auth API (e.g. `http://localhost:3001`). */
  apiUrl: string;
  /**
   * Called once the API returns 201. The parent page wires this to
   * the locale-aware `router.replace('/sign-in')` so a freshly-
   * registered user lands on the sign-in screen to authenticate
   * (per the brief: redirect to sign-in on success — NOT auto-
   * sign-in, since the cookie storage is deferred).
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
    formState: { errors, isSubmitting },
    reset,
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onSubmit",
    defaultValues: { email: "", password: "", name: "" },
  });

  const [formError, setFormError] = React.useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch {
      setFormError(tc("genericError"));
      return;
    }

    if (response.ok) {
      // Cookie storage lands in the slice 4 follow-up. Notify the
      // parent; the page redirects to /sign-in (or wherever the brief
      // chooses).
      reset();
      onSuccess?.();
      return;
    }

    if (response.status === 409) {
      setFormError(t("error.duplicateEmail"));
      return;
    }

    setFormError(tc("genericError"));
  });

  const emailError = errors.email?.message;
  const passwordError = errors.password?.message;
  const nameError = errors.name?.message;
  const emailErrorId = emailError ? "signup-email-error" : undefined;
  const passwordErrorId = passwordError ? "signup-password-error" : undefined;
  const nameErrorId = nameError ? "signup-name-error" : undefined;

  return (
    <Form
      onSubmit={onSubmit}
      aria-busy={isSubmitting}
      noValidate
      aria-describedby={formError ? "signup-form-error" : undefined}
      className={cn("flex flex-col gap-ui-space-4", className)}
    >
      {formError ? (
        <div
          id="signup-form-error"
          role="alert"
          className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
          data-testid="signup-form-error"
        >
          {formError}
        </div>
      ) : null}

      <div className="flex flex-col gap-ui-space-1">
        <label htmlFor="signup-email" className="text-ui-text-sm font-ui-font-medium text-ui-fg">
          {t("email")}
        </label>
        <Input
          id="signup-email"
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
            data-testid="signup-email-error"
          >
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-ui-space-1">
        <label
          htmlFor="signup-password"
          className="text-ui-text-sm font-ui-font-medium text-ui-fg"
        >
          {t("password")}
        </label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordErrorId}
          disabled={isSubmitting}
          {...register("password")}
        />
        {passwordError ? (
          <p
            id={passwordErrorId}
            className="text-ui-text-sm text-ui-danger"
            data-testid="signup-password-error"
          >
            {passwordError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-ui-space-1">
        <label
          htmlFor="signup-name"
          className="text-ui-text-sm font-ui-font-medium text-ui-fg"
        >
          {t("name")}
        </label>
        <Input
          id="signup-name"
          type="text"
          autoComplete="name"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameErrorId}
          disabled={isSubmitting}
          {...register("name")}
        />
        {nameError ? (
          <p
            id={nameErrorId}
            className="text-ui-text-sm text-ui-danger"
            data-testid="signup-name-error"
          >
            {nameError}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? tc("loading") : t("submit")}
      </Button>
    </Form>
  );
}