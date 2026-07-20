import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin/AdminNav";
import { AuditLogTable } from "@/components/admin/AuditLogTable";
import { AuditRetentionButton } from "@/components/admin/AuditRetentionButton";

/**
 * (app)/admin/audit page — M4 Phase 3 (PR #3, task 3.4).
 *
 * Server Component. Composes the audit-log surface:
 *  - `<AdminNav active="audit" />` — top-level admin nav (links
 *    to /admin/users, /admin/sessions, back-to-app). The "audit"
 *    tab is NEW for M4 — the nav's `active` prop is widened to
 *    accept it (see `AdminNav.tsx` — tab union was extended in
 *    the same atomic commit per AGENTS.md §5).
 *  - `<AuditLogTable />` — client component, owns the audit-event
 *    listing + the 5 form states per AGENTS.md §9
 *  - `<AuditRetentionButton />` — client component, owns the
 *    dry-run + real-purge buttons + confirm dialog
 *
 * The layout (`apps/web/app/[locale]/(app)/admin/layout.tsx`)
 * already guaranteed an ADMIN session; this page is purely
 * presentational. Search params are accepted in a future PR
 * (PR #4 — wire the filter bar's URL params via `searchParams`
 * so the page can server-fetch with the parsed filters).
 */

interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("admin.audit");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <AdminNav active="audit" locale={locale} />
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
        <p style={{ color: "#666" }}>{t("description")}</p>
      </header>
      <section style={{ marginBottom: "2rem" }}>
        <AuditLogTable />
      </section>
      <section>
        <AuditRetentionButton />
      </section>
    </main>
  );
}
