import type * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

/**
 * AuthErrorPage — module 2 public-auth (PR #1, task 1.4 TRIANGULATE).
 *
 * Server Component for `/[locale]/(auth)/error`. Per
 * `openspec/specs/nextauth-web-routes/spec.md` §Requirement:
 * Callback URL Validation:
 *
 *   "Invalid callback URLs MUST land the user on `pages.error`
 *    with localized copy; the response MUST NOT silently redirect
 *    to an attacker-controlled origin."
 *
 * NextAuth v5's standard error codes (the canonical set emitted via
 * `?error=<code>` query params when the user lands on `pages.error`)
 * cover the rejection scenarios in this slice and the OAuth slice
 * (PR #4). The page reads `searchParams.error` and renders a
 * localized message under `auth.error.codes.<code>`. Unknown codes
 * fall back to `auth.error.codes.unknown`.
 *
 * The `(auth)` route group keeps the auth surface visually grouped
 * without affecting the URL — the actual URL is `/en/error`
 * (or `/es/error`) per the next-intl `localePrefix: 'always'` policy.
 *
 * PR #1 ships the page so the localized destination exists from day
 * one. The NextAuth flow that REJECTS foreign callback URLs
 * (`tasks.md` 4.7) lands in PR #4 — this page is its terminal
 * surface. The page therefore does NOT itself enforce origin
 * validation; it only localizes whatever error code the upstream
 * NextAuth flow hands it.
 *
 * Per AGENTS.md §9 (`ui-complete-not-scaffold`, Engram id 2133), the
 * page renders a real Card + a localized message + a localized
 * back-link. The "5 form states" convention applies to interactive
 * forms (loading, error, success, empty, validation-error); this
 * terminal error surface has only one state (error) by definition.
 */

interface AuthErrorPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The canonical NextAuth v5 error codes. Each entry is mapped to a
 * localized message under `auth.error.codes.<code>`. Unknown codes
 * fall back to `auth.error.codes.unknown` (see the page render).
 *
 * Per NextAuth v5 docs
 * (https://authjs.dev/reference/core/errors), the standard set is:
 *   Configuration | AccessDenied | Verification | OAuthSignin |
 *   OAuthCallback | OAuthCreateAccount | EmailCreateAccount |
 *   Callback | OAuthAccountNotLinked | EmailSignin | CredentialsSignin |
 *   SessionRequired.
 *
 * `AccessDenied` is the canonical error emitted when a foreign
 * callback URL is rejected (NextAuth's CSRF / origin check).
 */
const NEXTAUTH_ERROR_CODES = [
  "Configuration",
  "AccessDenied",
  "Verification",
  "OAuthSignin",
  "OAuthCallback",
  "OAuthCreateAccount",
  "EmailCreateAccount",
  "Callback",
  "OAuthAccountNotLinked",
  "EmailSignin",
  "CredentialsSignin",
  "SessionRequired",
] as const;

type NextAuthErrorCode = (typeof NEXTAUTH_ERROR_CODES)[number];

function isNextAuthErrorCode(value: unknown): value is NextAuthErrorCode {
  return (
    typeof value === "string" &&
    (NEXTAUTH_ERROR_CODES as readonly string[]).includes(value)
  );
}

export default async function AuthErrorPage({
  params,
  searchParams,
}: AuthErrorPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const errorParam = resolvedSearchParams["error"];
  const errorCode =
    typeof errorParam === "string" && isNextAuthErrorCode(errorParam)
      ? errorParam
      : null;

  const t = await getTranslations("auth.error");

  const messageKey = errorCode === null ? "codes.unknown" : `codes.${errorCode}`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "var(--ui-bg)",
      }}
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t(messageKey)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${locale}/sign-in`}
            className="text-ui-text-sm text-ui-accent underline-offset-4 hover:underline"
          >
            {t("backToSignIn")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}