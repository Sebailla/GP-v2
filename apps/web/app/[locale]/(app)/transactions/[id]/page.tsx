import { getTranslations } from "next-intl/server";

import { EditTransactionForm } from "@/components/transactions/EditTransactionForm";

/**
 * (app)/transactions/[id] page — slice 6 (T6.6).
 *
 * Server Component. Renders the `EditTransactionForm` with the
 * path-param id. The (app) layout's session guard guarantees a
 * session is present. The form is responsible for the initial
 * GET /transactions/:id load + the PATCH on submit.
 */
interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditTransactionPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations("transactions.edit");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
      </header>
      <EditTransactionForm id={id} />
      <p style={{ color: "#999", fontSize: "0.75rem" }}>
        Locale: <code>{locale}</code>
      </p>
    </main>
  );
}
