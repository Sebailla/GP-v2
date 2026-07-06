"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import {
  loginSchema,
  type LoginInput,
} from "@features/auth/shared/schemas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

/**
 * LoginForm — slice 4 batch 4c (T4.1 + T4.8).
 *
 * Client component that wraps the canonical `loginSchema` (from
 * `libs/features/auth/shared/schemas/login`) via `react-hook-form` +
 * `@hookform/resolvers/zod`. On submit, POSTs `{ email, password }`
 * to `${apiUrl}/auth/login` and surfaces the result through:
 *
 *  - `onSuccess()` — 200 → the parent page triggers the redirect.
 *  - 401 → form-level banner with `auth.signIn.error.invalidCredentials`.
 *  - Other non-2xx (or network failure) → form-level banner with
 *    `auth.common.genericError`.
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
 *
 * The token returned by the API is NOT stored in this batch — that
 * lands in the slice 4 follow-up alongside the NextAuth client config
 * (T3.3 deferred item). The success path simply redirects to the
 * landing page; the user is NOT actually authenticated across reloads.
 */
export interface LoginFormProps {
  /** Base URL of the auth API (e.g. `http://localhost:3001`). */
  apiUrl: string;
  /**
   * Called once the API returns 200. The parent page wires this to the
   * next-intl-aware `router.replace(`/${locale}`)` (so the redirect
   * preserves the active locale).
   */
  onSuccess?: () => unknown;
  /**
   * Optional className appended to the wrapping `<Card>` (kept narrow —
   * the page owns layout, this form owns structure + semantics).
   */
  className?: string;
}

/**
 * LoginForm — see file header for the contract.
 *
 * Implementation notes:
 *  - `useForm` is wired with the Zod resolver so RHF owns the field-level
 *    error rendering. `mode: "onSubmit"` keeps the initial render quiet
 *    (the "empty" state) and only fires validation on submit.
 *  - The submit handler does NOT call `event.preventDefault()` directly —
 *    `react-hook-form`'s `handleSubmit` wraps the user callback and
 *    handles preventDefault internally.
 *  - `fetch` is called with `Content-Type: application/json` so the
 *    NestJS controller's `Body()` decorator parses the payload via
 *    `ZodValidationPipe(loginSchema)`.
 *  - Form-level errors are tracked via the local `formError` state,
 *    kept separate from RHF's field errors so a 401 doesn't get reported
 *    under a specific field.
 */
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
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    defaultValues: { email: "", password: "" },
  });

  const [formError, setFormError] = React.useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch {
      setFormError(tc("genericError"));
      return;
    }

    if (response.ok) {
      // Cookie storage lands in the slice 4 follow-up (NextAuth client
      // config — T3.3 deferred). For this batch we simply notify the
      // parent and reset the form's internal state.
      reset();
      onSuccess?.();
      return;
    }

    if (response.status === 401) {
      setFormError(t("error.invalidCredentials"));
      return;
    }

    setFormError(tc("genericError"));
  });

  const emailError = errors.email?.message;
  const passwordError = errors.password?.message;
  const emailErrorId = emailError ? "login-email-error" : undefined;
  const passwordErrorId = passwordError ? "login-password-error" : undefined;

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("email")}</CardDescription>
      </CardHeader>
      <Form
        onSubmit={onSubmit}
        aria-busy={isSubmitting}
        noValidate
        aria-describedby={formError ? "login-form-error" : undefined}
      >
        <CardContent className="flex flex-col gap-ui-space-4">
          {formError ? (
            <div
              id="login-form-error"
              role="alert"
              className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
              data-testid="login-form-error"
            >
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-ui-space-1">
            <label htmlFor="login-email" className="text-ui-text-sm font-ui-font-medium text-ui-fg">
              {t("email")}
            </label>
            <Input
              id="login-email"
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
                data-testid="login-email-error"
              >
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-ui-space-1">
            <label
              htmlFor="login-password"
              className="text-ui-text-sm font-ui-font-medium text-ui-fg"
            >
              {t("password")}
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordErrorId}
              disabled={isSubmitting}
              {...register("password")}
            />
            {passwordError ? (
              <p
                id={passwordErrorId}
                className="text-ui-text-sm text-ui-danger"
                data-testid="login-password-error"
              >
                {passwordError}
              </p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-ui-space-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tc("loading") : t("submit")}
          </Button>
        </CardFooter>
      </Form>
    </Card>
  );
}