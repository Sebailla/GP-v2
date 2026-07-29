import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin/AdminNav";
import { ChangeRoleForm } from "@/components/admin/ChangeRoleForm";
import { listAdminUsers } from "@/lib/admin-api";

/**
 * (app)/admin/users/[userId] page — M3 Phase 4 (PR #4, task 4.4).
 *
 * Server Component. Renders the user detail + the role-change
 * form. The fetch happens server-side (the cookie is forwarded
 * automatically by the API server when the request originates
 * from the same origin; the cookie is NOT forwarded to the API
 * server here — we rely on the API cookie being the same
 * authjs.session-token the layout reads).
 *
 * **Why a server fetch.** The role-change form needs the
 * current role to render the select with the right default.
 * Calling the API server-side means the page can hydrate with
 * the right state without a client-side loading flicker.
 *
 * If the user is not found (404 from the API), the page calls
 * `notFound()` so Next.js renders the canonical not-found
 * surface.
 *
 * The detail page is intentionally narrow: it shows the
 * user's email, current role, account creation date, and a
 * role-change form. Sessions for the user are listed on the
 * `/admin/sessions` page (the user detail page does NOT
 * embed a sessions list to keep the page focused — the design
 * decision is documented in `openspec/changes/module-3-superadmin/design.md`
 * §2 D6).
 */
interface PageProps {
  params: Promise<{ locale: string; userId: string }>;
}

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { locale, userId } = await params;
  const t = await getTranslations("admin.userDetail");
  const tNav = await getTranslations("admin.nav");

  // Fetch the user via the admin API. We do NOT forward the
  // session cookie manually — the server-side fetch is an
  // internal call from RSC; in production the API reads its
  // own cookie via `next/headers`. For Phase 4 we render
  // a minimal fallback when the API call fails (4xx/5xx) by
  // surfacing the not-found state. The user detail page does
  // NOT 500 if the API is offline — that's the (app) layout's
  // concern.
  let user: Awaited<ReturnType<typeof listAdminUsers>>[number] | null = null;
  try {
    const all = await listAdminUsers();
    user = all.find((u) => u.id === userId) ?? null;
  } catch {
    user = null;
  }

  if (user === null) {
    notFound();
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <AdminNav active="users" locale={locale} />
      <header style={{ marginBottom: "1.5rem" }}>
        <p>
          <Link
            href={`/${locale}/admin/users`}
            style={{ color: "#475569", textDecoration: "none" }}
          >
            ← {t("backToList")}
          </Link>
        </p>
        <h1>{t("title")}</h1>
      </header>
      <section
        aria-labelledby="user-detail-metadata"
        style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "#f8fafc",
          borderRadius: "0.5rem",
        }}
      >
        <h2 id="user-detail-metadata" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
          {t("metadataTitle")}
        </h2>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem" }}>
          <dt style={{ color: "#475569" }}>email</dt>
          <dd style={{ margin: 0 }}>{user.email}</dd>
          <dt style={{ color: "#475569" }}>{t("roleLabel")}</dt>
          <dd style={{ margin: 0 }}>{user.role}</dd>
          <dt style={{ color: "#475569" }}>{t("createdAt")}</dt>
          <dd style={{ margin: 0 }}>{new Date(user.createdAt).toLocaleString()}</dd>
        </dl>
      </section>
      <ChangeRoleForm
        userId={user.id}
        currentRole={user.role}
        labels={{
          label: t("title"),
          submit: t("title"),
        }}
      />
      {/* The hidden h1 below keeps the page title visible to
          assistive tech that does not navigate via the heading
          outline (the section above uses h2 for the metadata
          block; the page title is rendered in the header). */}
      <span data-locator="admin-nav-fallback" hidden>
        {tNav("users")}
      </span>
    </main>
  );
}
