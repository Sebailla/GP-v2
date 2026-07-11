"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";

import { SignUpForm } from "./SignUpForm";

/**
 * SignUpClient — slice 4 batch 4c (T4.9).
 *
 * Thin client wrapper that bridges the SignUpForm's `onSuccess`
 * callback to `next/navigation#useRouter#replace`. Mirrors
 * SignInClient (T4.8) — the redirect helper is server-only so
 * the post-201 redirect must happen client-side.
 *
 * On 201 (successful registration) we redirect to `/sign-in`
 * rather than the landing page: the brief's deferred cookie
 * storage means the freshly-registered user is NOT actually
 * authenticated, so sending them straight to the landing would
 * look like a broken state. Routing to `/sign-in` lets them
 * authenticate with the credentials they just created.
 */
export interface SignUpClientProps {
  /** Base URL of the API — sourced from `env.API_URL` at the page level. */
  apiUrl: string;
  /** Active locale — preserved across the redirect (e.g. `en` or `es`). */
  locale: string;
}

export function SignUpClient({ apiUrl, locale }: SignUpClientProps): React.JSX.Element {
  const router = useRouter();
  return (
    <SignUpForm
      apiUrl={apiUrl}
      onSuccess={() => {
        router.replace(`/${locale}/sign-in`);
      }}
    />
  );
}
