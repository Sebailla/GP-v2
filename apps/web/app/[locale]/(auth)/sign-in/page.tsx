import { getTranslations } from "next-intl/server";
import { env } from "@core/config";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { SignInClient } from "@/components/auth/SignInClient";

/**
 * SignInPage — slice 4 batch 4c (T4.8).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/sign-in` route.
 * The `(auth)` route group keeps the auth surface visually grouped
 * without affecting the URL — the actual URL is `/en/sign-in`
 * (or `/es/sign-in`) per the next-intl `localePrefix: 'always'`
 * policy.
 *
 * Per convention `ui-complete-not-scaffold` (Engram id 2133), this
 * page wraps the LoginForm in a Card with the title sourced from
 * the i18n catalog via `getTranslations("auth.signIn")`.
 *
 * Page layout:
 *  - `<main>` (semantic landmark; the `(auth)` group has no layout
 *    yet, so the page owns the full vertical layout).
 *  - `<Card>` (slice 4 batch 4b primitive) with the title +
 *    description.
 *  - `<SignInClient>` (client wrapper that bridges LoginForm's
 *    `onSuccess` to `router.replace('/{locale}/')`).
 *
 * Deferred (NOT implemented in this batch — T3.3 deferred item):
 *  - Redirect-if-already-authenticated. Without `apps/web/auth.ts`
 *    wired up to NextAuth, there is no `auth()` to call. The page
 *    renders LoginForm unconditionally; the success path simply
 *    redirects to /{locale}/ (the user is NOT actually
 *    authenticated across reloads; that lands alongside the
 *    NextAuth client config in the slice 4 follow-up).
 *
 * The session token returned by POST /auth/login is NOT stored —
 * cookie storage lands alongside the NextAuth client config.
 */
interface SignInPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignInPage({
  params,
}: SignInPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  const t = await getTranslations("auth.signIn");

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
          <CardDescription>{t("email")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInClient apiUrl={env.API_URL} locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}