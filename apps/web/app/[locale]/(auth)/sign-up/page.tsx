import { getTranslations } from "next-intl/server";
import { env } from "@core/config";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { SignUpClient } from "@/components/auth/SignUpClient";

/**
 * SignUpPage — slice 4 batch 4c (T4.9).
 *
 * Server Component (RSC) for the `/[locale]/(auth)/sign-up` route.
 * Same pattern as the sign-in page (T4.8): the `(auth)` route
 * group keeps the auth surface visually grouped without affecting
 * the URL.
 *
 * Per convention `ui-complete-not-scaffold` (Engram id 2133), this
 * page wraps the SignUpForm in a Card with the title sourced from
 * the i18n catalog via `getTranslations("auth.signUp")`.
 *
 * On 201 (successful registration) the SignUpClient wrapper
 * redirects to `/[locale]/sign-in` (the brief explicitly chose
 * this over the landing page — see SignUpClient JSDoc). The user
 * is NOT actually authenticated after registration; cookie storage
 * is deferred to the slice 4 follow-up alongside the NextAuth
 * client config (T3.3 deferred).
 *
 * The session token returned by POST /auth/register is NOT stored
 * — same rationale as the sign-in page.
 */
interface SignUpPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignUpPage({
  params,
}: SignUpPageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  const t = await getTranslations("auth.signUp");

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
          <SignUpClient apiUrl={env.API_URL} locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}