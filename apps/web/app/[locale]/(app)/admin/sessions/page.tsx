import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin/AdminNav";
import { SessionsTable } from "@/components/admin/SessionsTable";

/**
 * (app)/admin/sessions page — M3 Phase 4 (PR #4, task 4.4).
 *
 * Server Component. Renders the admin nav + the sessions table
 * client component. The layout has already guaranteed an ADMIN
 * session; this page is purely presentational.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("admin.sessions");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <AdminNav active="sessions" locale={locale} />
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
        <p style={{ color: "#666" }}>{t("description")}</p>
      </header>
      <SessionsTable />
    </main>
  );
}
