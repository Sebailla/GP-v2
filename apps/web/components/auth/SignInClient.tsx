"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

import { LoginForm } from "./LoginForm";
import { isGoogleConfigured } from "@/lib/google-enabled";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * SignInClient — slice 4 batch 4c (T4.8) + slice 4 batch 2
 * (cookie-on-success) + module 2 public-auth (PR #1, tasks 1.1
 * + 1.3).
 *
 * Thin client wrapper that bridges the LoginForm's `onSuccess`
 * callback to a `next/navigation#useRouter#replace` redirect, and
 * (module 2) renders a Google sign-in button when Google OAuth is
 * configured in the current environment.
 *
 * **Slice 4 batch 2 wiring.** The LoginForm (slice 4 batch 2) is
 * responsible for persisting the session via `setSessionCookie`
 * before calling `onSuccess(session)`. The wrapper therefore just
 * navigates; the cookie is already on disk by the time
 * `router.replace` resolves. The same pattern applies to
 * SignUpClient + SignUpForm (the form persists the cookie, the
 * wrapper navigates).
 *
 * **Module 2 PR #1 — locale-aware redirect (task 1.1 GREEN +
 * 1.2 GREEN).** The post-sign-in redirect target is
 * `/${locale}/(app)` — the (app) route group that the design
 * designates as the post-auth dashboard. The slice-4 batch 2
 * implementation routed to `/${locale}` (the bare landing);
 * module 2 updates it per
 * `openspec/changes/module-2-public-auth/proposal.md` §Product
 * decisions ("Redirect post sign-in: /[locale]/(app) (dashboard)").
 *
 * **Module 2 PR #1 — Google button (tasks 1.1 RED + 1.3 GREEN +
 * 1.5 REFACTOR).** When Google OAuth credentials are present in
 * the environment (predicate: `isGoogleConfigured()`), the
 * client renders a Google button above the credentials form.
 * Clicking the button calls `signIn("google", { callbackUrl:
 * "/{locale}/(app)" })` from `next-auth/react` so the OAuth
 * handshake completes against the same locale-aware target. When
 * either credential is missing, the button is hidden — a future
 * deploy without GOOGLE_CLIENT_ID never shows a button that would
 * 500 when clicked.
 *
 * `router.replace` is preferred over `router.push` so the sign-in
 * URL is replaced in the history stack — the user can't navigate
 * back to the form after authenticating.
 *
 * The locale is passed from the page (server component) because
 * `useParams()` is also client-only and would force the page to
 * be a client component (losing the ability to call
 * `getTranslations` from `next-intl/server`).
 */
export interface SignInClientProps {
  /** Base URL of the API — sourced from `env.API_URL` at the page level. */
  apiUrl: string;
  /** Active locale — preserved across the redirect (e.g. `en` or `es`). */
  locale: string;
}

export function SignInClient({ apiUrl, locale }: SignInClientProps): React.JSX.Element {
  const router = useRouter();
  const t = useTranslations("auth.signIn");
  const showGoogleButton = isGoogleConfigured();

  // Build the post-auth target once — the credentials success
  // path AND the Google OAuth handshake both redirect here.
  const callbackUrl = `/${locale}/(app)`;

  return (
    <div className={cn("flex flex-col gap-ui-space-4")}>
      {showGoogleButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            void signIn("google", { callbackUrl });
          }}
        >
          {t("google")}
        </Button>
      ) : null}
      {showGoogleButton ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          className="flex items-center gap-ui-space-2 text-ui-text-sm text-ui-fg-muted"
        >
          <span className="flex-1 border-t border-ui-border" aria-hidden="true" />
          <span>{t("dividerOr")}</span>
          <span className="flex-1 border-t border-ui-border" aria-hidden="true" />
        </div>
      ) : null}
      <LoginForm
        apiUrl={apiUrl}
        onSuccess={() => {
          router.replace(callbackUrl);
        }}
      />
    </div>
  );
}