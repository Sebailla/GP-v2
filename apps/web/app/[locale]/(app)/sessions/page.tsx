import { getTranslations } from "next-intl/server";

import { SessionList } from "@/components/auth/SessionList";

/**
 * (app)/sessions page — slice 6 (T6.3).
 *
 * Server Component. Renders the `SessionList` client component.
 * The (app) layout's session guard guarantees a session is present.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function SessionsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("auth.sessions");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
      </header>
      <SessionList />
      <p style={{ color: "#999", fontSize: "0.75rem" }}>
        Locale: <code>{locale}</code>
      </p>
    </main>
  );
}
