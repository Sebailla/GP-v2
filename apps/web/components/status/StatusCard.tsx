import { useTranslations } from "next-intl";

import { StatusBadge } from "./StatusBadge";
import type { StatusPayload } from "@/lib/status-client";
import { StatusPolling } from "./StatusPolling";

const backupTone = (status: StatusPayload["lastBackupStatus"]): "ok" | "warn" | "error" =>
  status === "ok" ? "ok" : status === "never" ? "warn" : "error";

export function StatusCard({
  status,
  locale,
}: {
  status: StatusPayload;
  locale: string;
}): React.JSX.Element {
  const t = useTranslations("status");
  return (
    <section aria-labelledby="status-card-title" className="mt-ui-space-6 space-y-ui-space-4">
      <h2 id="status-card-title" className="sr-only">
        {t("cardTitle")}
      </h2>
      <dl className="grid grid-cols-2 gap-ui-space-3 text-sm">
        <dt>{t("environment")}</dt>
        <dd data-testid="status-environment">
          <StatusBadge tone="info">{status.environment}</StatusBadge>
        </dd>
        <dt>{t("commit")}</dt>
        <dd data-testid="status-commit">
          <code>{status.commit}</code>
        </dd>
        <dt>{t("lastBackup")}</dt>
        <dd data-testid="status-last-backup">
          <StatusBadge tone={backupTone(status.lastBackupStatus)}>
            {status.lastBackupAt ?? t("never")}
          </StatusBadge>
        </dd>
        <dt>{t("uptime")}</dt>
        <dd>{status.uptimeSeconds}s</dd>
        <dt>{t("publicApiUrl")}</dt>
        <dd>
          <a className="underline" href={status.publicUrl.api}>
            {status.publicUrl.api}
          </a>
        </dd>
        <dt>{t("publicWebUrl")}</dt>
        <dd>
          <a className="underline" href={status.publicUrl.web}>
            {status.publicUrl.web}
          </a>
        </dd>
      </dl>
      <StatusPolling locale={locale} initial={status} />
    </section>
  );
}
