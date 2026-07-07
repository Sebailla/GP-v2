"use client";

import type * as React from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * FormFieldRow — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Thin wrapper that owns the canonical label + input + field-error row
 * pattern repeated across all 4 auth forms (LoginForm / SignUpForm /
 * ForgotPasswordForm / ResetPasswordForm). The wrapper handles the
 * `aria-invalid` + `aria-describedby` + `data-testid={id}-error`
 * wiring automatically so the per-form bodies stay free of the
 * accessibility plumbing.
 *
 * **Accessibility contract.**
 *  - The `<label htmlFor={id}>` ties the visible label to the input by id.
 *  - When `error` is non-empty, the input gets `aria-invalid="true"` and
 *    `aria-describedby="${id}-error"` so screen readers announce the
 *    error after the field's label.
 *  - The error `<p role="alert" data-testid="${id}-error">` is the live
 *    region that surfaces the error message in the DOM tree.
 *
 * **Why this exists.**
 *  - The 4 forms duplicate the same JSX block (`<div className=...>` +
 *    `<label htmlFor=...>` + `<Input ...>` + `{error ? <p .../> : null}`)
 *    with minor variations (id prefix, type, autoComplete). This is the
 *    duplication R2 + R3 flagged in batch 4c + 4d reviews.
 *  - Centralizing it here cuts ~25 lines per form (~100 lines total)
 *    while keeping the per-form test surface unchanged (the rendered
 *    DOM — `data-testid`, `aria-invalid`, `aria-describedby` — stays
 *    byte-for-byte identical to the pre-refactor shape).
 *
 * **Why `registration` is typed `UseFormRegisterReturn` (not generic over the form).**
 *  - The wrapper doesn't need to know about the form's schema — it just
 *    spreads the `ref`/`onChange`/`onBlur`/`name` triple that RHF's
 *    `register(name)` returns. Generic typing would force every caller
 *    to thread the form's `FieldValues` through the wrapper for no
 *    observable benefit (the wrapper doesn't validate the name).
 */
export interface FormFieldRowProps {
  /** The input id (also used to derive the error id as `${id}-error`). */
  id: string;
  /** The visible label text. Resolved by the caller from the i18n catalog. */
  label: string;
  /** Native input type. Defaults to `"text"`. */
  type?: "text" | "email" | "password" | "tel";
  /** Native `autoComplete` token (e.g. `"email"`, `"current-password"`). */
  autoComplete?: string;
  /** The resolved error message; when truthy the field is marked invalid. */
  error?: string | undefined;
  /** The `register(name)` return value from `react-hook-form`. */
  registration: UseFormRegisterReturn;
  /** When true, the input is disabled (mirrors the form's loading state). */
  disabled?: boolean;
  /**
   * Override the input's `data-testid`. Defaults to `id`. Tests assert
   * on `data-testid="${id}-error"` for the error `<p>`; the input itself
   * is queried via `getByLabelText` in the existing form tests, so the
   * default (the input id) is fine for the established pattern.
   */
  dataTestid?: string;
  /**
   * Optional className appended to the wrapping `<div>`. The default
   * is the canonical `flex flex-col gap-ui-space-1` row layout used by
   * every auth form.
   */
  className?: string;
}

export function FormFieldRow({
  id,
  label,
  type = "text",
  autoComplete,
  error,
  registration,
  disabled,
  dataTestid,
  className,
}: FormFieldRowProps): React.JSX.Element {
  const errorId = `${id}-error`;
  const hasError = Boolean(error);
  return (
    <div className={cn("flex flex-col gap-ui-space-1", className)}>
      <label htmlFor={id} className="text-ui-text-sm font-ui-font-medium text-ui-fg">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={hasError ? errorId : undefined}
        disabled={disabled}
        data-testid={dataTestid ?? id}
        {...registration}
      />
      {hasError ? (
        <p
          id={errorId}
          role="alert"
          className="text-ui-text-sm text-ui-danger"
          data-testid={errorId}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}