import { getTranslations } from "next-intl/server";

export default async function Loading(): Promise<React.JSX.Element> {
  const t = await getTranslations("status");
  return (
    <main className="mx-auto max-w-3xl p-ui-space-6">
      <p>{t("loading")}</p>
    </main>
  );
}
