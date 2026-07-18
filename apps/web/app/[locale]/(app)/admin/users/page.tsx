import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin/AdminNav";
import { UsersTable } from "@/components/admin/UsersTable";

/**
 * (app)/admin/users page — M3 Phase 4 (PR #4, task 4.4).
 *
 * Server Component. Renders the admin nav + the users table
 * client component. The layout (apps/web/app/[locale]/(app)/
 * admin/layout.tsx) has already guaranteed an ADMIN session;
 * this page is purely presentational.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("admin.users");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <AdminNav active="users" locale={locale} />
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
        <p style={{ color: "#666" }}>{t("description")}</p>
      </header>
      <UsersTable />
    </main>
  );
}
