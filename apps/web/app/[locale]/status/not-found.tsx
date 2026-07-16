import { getTranslations } from "next-intl/server";

export default async function NotFound(): Promise<React.JSX.Element> {
  const t = await getTranslations("status");
  return (
    <main className="mx-auto max-w-3xl p-ui-space-6">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
    </main>
  );
}
