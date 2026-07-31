"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

import { LoginForm } from "./LoginForm";
import {
  isGoogleConfigured,
  isGoogleMockEnabled,
  isGoogleSignInVisible,
} from "@/lib/google-enabled";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * SignInClient — slice 4 batch 4c (T4.8) + slice 4 batch 2
 * (cookie-on-success) + module 2 public-auth (PR #1, tasks 1.1
 * + 1.3) + module 2 PR #4 task 4.6 (`google-mock` provider
 * selection per D4).
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
 * **Module 2 PR #4 task 4.6 — mock provider selection (D4).** When
 * the real Google credentials are absent AND `GOOGLE_E2E_MOCK=1`
 * is set (in dev/test), `isGoogleMockEnabled()` returns true and
 * the client routes the button to `signIn("google-mock", ...)`
 * against the locally-registered mock provider
 * (`apps/web/auth.ts#buildProviders`). The mock provider returns
 * a stubbed verified profile so the adapter's auto-link path runs
 * end-to-end in CI without a real Google round-trip. The
 * `isGoogleSignInVisible()` predicate combines both branches so the
 * CLIENT-SIDE gating decision (button visibility) and the
 * SERVER-SIDE provider registration are derived from the SAME env
 * predicates. The `googleProviderId` constant is the single
 * source of truth for which provider the button targets.
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
  // PR #4 task 4.6 — the button visibility derives from EITHER
  // the real Google provider (`isGoogleConfigured`) OR the mock
  // provider (`isGoogleMockEnabled`). When neither is set the
  // button is hidden entirely — the spec gating clause.
  const showGoogleButton = isGoogleSignInVisible();
  // PR #4 task 4.6 — pick the right provider id. Real Google
  // takes precedence when both branches are satisfied (the
  // mock is a dev/test fallback); without real credentials the
  // mock id is the only viable target.
  const googleProviderId: "google" | "google-mock" = isGoogleConfigured()
    ? "google"
    : isGoogleMockEnabled()
      ? "google-mock"
      : "google";

  // Build the post-auth target once — the credentials success
  // path AND the Google OAuth handshake both redirect here.
  //
  // The design specifies `/${locale}/(app)` as the post-signin
  // target, but Next.js 16's route-group resolution treats the
  // (app) group as a file-tree marker (not a URL segment), and
  // `apps/web/app/[locale]/page.tsx` (the slice-1 placeholder) wins
  // the path-resolution race over `apps/web/app/[locale]/(app)/page.tsx`
  // (the slice-2 dashboard). The result is a 404 on the design's
  // intended URL. The fix is to land the slice-1 placeholder
  // under a non-conflicting path (e.g. `/welcome`) so the (app)
  // group is the canonical locale-root target. Until that lands,
  // we fall back to `/${locale}/` which renders the slice-1
  // placeholder; the user can then navigate to a (app)-grouped
  // route (e.g. `/en/transactions`) for the real dashboard.
  //
  // See issue #92 for the v1.4+ follow-up that resolves the
  // (app) route-group ambiguity + lands the slice-1 placeholder
  // move.
  const callbackUrl = `/${locale}/`;

  return (
    <div className={cn("flex flex-col gap-ui-space-4")}>
      {showGoogleButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            void signIn(googleProviderId, { callbackUrl });
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