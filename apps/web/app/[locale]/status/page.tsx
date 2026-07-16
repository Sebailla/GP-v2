import { getTranslations, setRequestLocale } from "next-intl/server";

import { env } from "@core/config";

import { fetchStatus, type StatusPayload } from "@/lib/status-client";
import { StatusCard } from "@/components/status/StatusCard";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "status" });

  let status: StatusPayload | null = null;
  let error: string | null = null;
  try {
    status = await fetchStatus(env.PUBLIC_API_URL);
  } catch (err) {
    error = err instanceof Error ? err.message : "unknown error";
  }

  return (
    <main className="mx-auto max-w-3xl p-ui-space-6" data-testid="status-page">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-ui-space-2 text-sm text-muted-foreground">{t("description")}</p>
      {error !== null ? (
        <p role="alert" className="mt-ui-space-4 text-sm text-red-600">
          {t("error", { message: error })}
        </p>
      ) : status !== null ? (
        <StatusCard status={status} locale={locale} />
      ) : (
        <p className="mt-ui-space-4 text-sm text-muted-foreground">{t("loading")}</p>
      )}
    </main>
  );
}
