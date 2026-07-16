"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { StatusPayload } from "@/lib/status-client";

const POLL_INTERVAL_MS = 60_000;

export function StatusPolling({
  initial,
  locale,
}: {
  initial: StatusPayload;
  locale: string;
}): React.JSX.Element {
  const t = useTranslations("status");
  const [current, setCurrent] = useState<StatusPayload>(initial);

  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok) {
          setCurrent((await res.json()) as StatusPayload);
        }
      } catch {
        // Ignore network errors during polling.
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [locale]);

  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {t("lastUpdate", { ts: current.startedAt })}
    </p>
  );
}
