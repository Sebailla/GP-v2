"use client";

import type * as React from "react";

/**
 * AuthFormErrorBanner — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Form-level error banner used by all 4 auth forms (LoginForm /
 * SignUpForm / ForgotPasswordForm / ResetPasswordForm). Centralizes the
 * `role="alert" + data-testid={id}` + danger-token styling that every
 * pre-refactor form inlined as a ~6-line JSX block.
 *
 * **Why a wrapper.**
 *  - The 4 forms render the SAME banner block:
 *    ```tsx
 *    <div id={...} role="alert" data-testid={...}
 *         className="rounded-ui-md border border-ui-danger bg-ui-danger/10 ...">
 *      {formError}
 *    </div>
 *    ```
 *    with only `id` + `data-testid` + the message differing. The
 *    duplication is brittle (a class rename or a testid rename has to
 *    land 4× across the forms).
 *  - When `message` is `null`, the banner renders nothing. Callers do
 *    not need to wrap the banner in `{formError ? <Banner/> : null}`
 *    themselves — passing `message={formError}` is enough.
 *
 * **Accessibility contract.**
 *  - `role="alert"` makes the banner a live region so screen readers
 *    announce new errors as soon as they appear.
 *  - The id is exposed so the wrapping `<form aria-describedby={id}>`
 *    can point at it; the form-level banner is read after the field
 *    labels when the user tabs through the form.
 *
 * **Why the banner is NOT styled with the `cn` helper.**
 *  - The className is a fixed token-driven set (no caller-side
 *    overrides). Keeping it inline avoids the `cn(...)` indirection
 *    for a static class string.
 */
export interface AuthFormErrorBannerProps {
  /** DOM id; matches the form's `aria-describedby` and the testid. */
  id: string;
  /** The error message; when `null`, the banner renders nothing. */
  message: string | null;
}

export function AuthFormErrorBanner({
  id,
  message,
}: AuthFormErrorBannerProps): React.JSX.Element | null {
  if (message === null) {
    return null;
  }
  return (
    <div
      id={id}
      role="alert"
      className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
      data-testid={id}
    >
      {message}
    </div>
  );
}