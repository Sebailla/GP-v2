import { getTranslations } from "next-intl/server";

import { CategoryManager } from "@/components/transactions/CategoryManager";

/**
 * (app)/categories page — slice 6 (T6.7).
 *
 * Server Component. Renders the `CategoryManager` client component.
 * The (app) layout's session guard guarantees a session is present.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function CategoriesPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("categories.list");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
        <p style={{ color: "#666" }}>{t("subtitle")}</p>
      </header>
      <CategoryManager />
      <p style={{ color: "#999", fontSize: "0.75rem" }}>
        Locale: <code>{locale}</code>
      </p>
    </main>
  );
}
