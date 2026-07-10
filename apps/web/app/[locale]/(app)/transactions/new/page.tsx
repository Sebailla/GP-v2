import { getTranslations } from "next-intl/server";

import { CreateTransactionForm } from "@/components/transactions/CreateTransactionForm";

/**
 * (app)/transactions/new page — slice 6 (T6.5).
 *
 * Server Component. The (app) layout's session guard guarantees a
 * session is present. The header + the `CreateTransactionForm` is
 * the entire surface; the form is responsible for categories +
 * category-state loading.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-dynamic";

export default async function NewTransactionPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("transactions.new");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
      </header>
      <CreateTransactionForm />
      <p style={{ color: "#999", fontSize: "0.75rem" }}>
        Locale: <code>{locale}</code>
      </p>
    </main>
  );
}
