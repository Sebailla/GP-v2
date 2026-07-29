"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const t = useTranslations("status");
  return (
    <main className="mx-auto max-w-3xl p-ui-space-6">
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="mt-ui-space-2 text-sm">{t("error", { message: error.message })}</p>
      <button type="button" onClick={reset} className="mt-ui-space-4 underline">
        {t("retry")}
      </button>
    </main>
  );
}
