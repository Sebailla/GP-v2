"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

/**
 * Hard upper bound on how long a single auth `fetch` may be in-flight
 * before the browser aborts the request via `AbortSignal.timeout(ms)`.
 * Without this, a stalled API would leave the form in the loading state
 * indefinitely (the user sees a disabled button + an `aria-busy` form
 * with no resolution). 10 seconds is generous for a localhost API call
 * and short enough that the user gets a timely timeout error.
 */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * useAuthApiPost — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Small hook that wraps the `fetch → try/catch → status-code mapping →
 * form-level banner state` pattern repeated across all 4 auth forms.
 * Each form inlined the same ~25-line try/catch block; this hook
 * centralizes it so the per-form bodies shrink to a one-liner
 * `submit(values)` call plus a status-code `errorMap`.
 *
 * **Surface.**
 *  - `submit(values)`: triggers a POST to `${apiBaseUrl}${endpoint}` with
 *    the JSON-encoded `values`. Returns a `Promise<void>` so callers
 *    can `await` it if they need to chain further work; the success /
 *    error branches are signaled via `formError` + `onSuccess`.
 *  - `isSubmitting`: `true` while the request is in-flight. The caller
 *    wires this into the form's submit button `disabled` + the form's
 *    `aria-busy="true"`.
 *  - `formError`: the resolved error message for the form-level banner
 *    (`<AuthFormErrorBanner id=... message={formError} />`). `null` when
 *    there's no banner to render.
 *
 * **Why a hook and not a plain function.**
 *  - The form-level banner state + the loading state are React state —
 *    a plain function would force callers to manage both states by
 *    hand, which is exactly the duplication this hook is meant to kill.
 *  - The hook does NOT manage the field-level errors (those belong to
 *    `react-hook-form` via the Zod resolver). It only owns the
 *    form-level banner state.
 *
 * **Why an `errorMap` instead of branching inline.**
 *  - Each form has its own set of meaningful statuses (401 → invalid
 *    credentials, 409 → duplicate email). The map lets the caller
 *    declare those once at the call site, and the hook walks the map
 *    for a hit before falling back to `defaultErrorMessage`.
 *  - Any mapped value can be either a static string OR a function that
 *    receives the `tc` translator (scope `"auth.common"`). This keeps
 *    the error keys flowing through `next-intl` like the rest of the
 *    forms' copy.
 */
export interface UseAuthApiPostArgs {
  /** Base URL of the API (e.g. `http://localhost:3001`). */
  apiBaseUrl: string;
  /** Endpoint path appended to `apiBaseUrl` (e.g. `/auth/login`). */
  endpoint: string;
  /**
   * Per-status error message. Keys are HTTP status codes; values are
   * the already-resolved error string (callers translate their i18n
   * key in their own scope and pass the resolved string). Statuses not
   * in the map fall through to `defaultErrorMessage`.
   */
  errorMap: Record<number, string>;
  /**
   * Fallback message for non-mapped non-2xx statuses + network
   * failures. The hook uses the `"auth.common"` translator's
   * `genericError` key by default — callers usually pass the same
   * string but the surface accepts an override for tests.
   */
  defaultErrorMessage?: string;
  /**
   * Optional success callback. Fires exactly once when the response
   * is 2xx. Receives the parsed JSON response (the API's success
   * body, e.g. `{ id, email, role, sessionToken }` for login /
   * register). The caller wires this to `onSuccess` (e.g. parent
   * redirect via `router.replace`, the success-state transition,
   * the cookie-set side effect, etc.).
   */
  onSuccess?: (data: unknown) => unknown;
}

export interface UseAuthApiPostResult {
  submit: (values: unknown) => Promise<void>;
  isSubmitting: boolean;
  formError: string | null;
}

export function useAuthApiPost({
  apiBaseUrl,
  endpoint,
  errorMap,
  defaultErrorMessage,
  onSuccess,
}: UseAuthApiPostArgs): UseAuthApiPostResult {
  const tc = useTranslations("auth.common");
  const fallback = defaultErrorMessage ?? tc("genericError");

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Keep `onSuccess` in a ref so the returned `submit` callback identity
  // is stable across renders. Without this the form would re-render on
  // every `onSuccess` identity change (e.g. when the parent re-renders
  // and recreates the closure), which is wasteful and can confuse RHF's
  // `handleSubmit` memoization.
  const onSuccessRef = React.useRef(onSuccess);
  React.useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const submit = React.useCallback(
    async (values: unknown): Promise<void> => {
      setFormError(null);
      setIsSubmitting(true);
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        // Distinguish the `AbortSignal.timeout(ms)` deadline from
        // generic network failures (DNS, offline, CORS preflight
        // failure, etc.) so the user gets a meaningful message.
        // `AbortSignal.timeout` rejects with a DOMException whose
        // name is `"TimeoutError"`; any other failure shape gets
        // the generic fallback.
        if (error instanceof DOMException && error.name === "TimeoutError") {
          setFormError(tc("error.timeout"));
        } else {
          setFormError(fallback);
        }
        setIsSubmitting(false);
        return;
      }

      if (response.ok) {
        // Parse the success body so callers (the auth forms) can
        // extract the sessionToken + user projection without
        // re-reading the response. Slice 4 batch 2 needs this for
        // the cookie-on-success wiring: the form passes the
        // decoded Session to the parent's onSuccess so the parent
        // can call setSessionCookie + navigate.
        let data: unknown = null;
        try {
          data = (await response.json()) as unknown;
        } catch {
          // Empty body — surface as `null`; callers handle
          // gracefully (a missing body on a 2xx is unusual but
          // not catastrophic).
          data = null;
        }
        setIsSubmitting(false);
        onSuccessRef.current?.(data);
        return;
      }

      const mapped = errorMap[response.status];
      setFormError(mapped ?? fallback);
      setIsSubmitting(false);
    },
    [apiBaseUrl, endpoint, errorMap, fallback, tc],
  );

  return { submit, isSubmitting, formError };
}
