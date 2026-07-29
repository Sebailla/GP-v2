"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * ThresholdAlert — slice 6 (T6.9).
 *
 * Client Component. Persistent, dismissable banner that surfaces
 * when the slice 5 server reports that a category's transactions
 * have crossed the configured threshold (D-TX). The alert is
 * deliberately a separate surface from a toast — design §5.9
 * mandates the alert is persistent + dismissable as a separate
 * affordance, not a transient notification.
 *
 * The component polls /transactions/threshold-events on mount.
 * If the response includes active threshold events, renders a
 * banner per event with a "Dismiss" button that calls
 * /transactions/threshold-events/:id/dismiss (slice 5 server).
 *
 * 5 form states: loading (initial poll in flight), error
 * (server returned 4xx/5xx), success-empty (no active events —
 * render nothing), success-non-empty (render banners), and
 * "dismissed" (the user clicked Dismiss and the local list
 * removes the entry optimistically).
 */
export function ThresholdAlert({
  pollingIntervalMs = 30_000,
}: {
  pollingIntervalMs?: number;
} = {}) {
  const t = useTranslations("transactions.threshold");
  const tCommon = useTranslations("common");

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | {
        kind: "success";
        events: ReadonlyArray<{
          id: string;
          categoryId: string;
          threshold: string;
          total: string;
          currency: string;
        }>;
      }
  >({ kind: "loading" });

  const fetchEvents = React.useCallback(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/transactions/threshold-events`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setState({ kind: "error", error: `${res.status} ${res.statusText}` });
        return;
      }
      const data = (await res.json()) as {
        events: {
          id: string;
          categoryId: string;
          threshold: string;
          total: string;
          currency: string;
        }[];
      };
      setState({ kind: "success", events: data.events });
    } catch (err) {
      setState({
        kind: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  React.useEffect(() => {
    fetchEvents();
    const id = setInterval(fetchEvents, pollingIntervalMs);
    return () => clearInterval(id);
  }, [fetchEvents, pollingIntervalMs]);

  const dismiss = async (id: string) => {
    // Optimistic: remove from the local list immediately, then
    // notify the server. The server may re-emit the event in the
    // next poll if the dismissal did not stick.
    setState((prev) =>
      prev.kind === "success"
        ? { kind: "success", events: prev.events.filter((e) => e.id !== id) }
        : prev,
    );
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/transactions/threshold-events/${id}/dismiss`,
        { method: "POST", credentials: "include" },
      );
    } catch {
      // The optimistic removal stays; the next poll re-syncs
      // from the server.
    }
  };

  if (state.kind !== "success" || state.events.length === 0) {
    // loading / error / success-empty: render nothing.
    // Slice 6 follow-up wires an error toast for the error state.
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        padding: "1rem",
        background: "#fef3c7",
        border: "1px solid #f59e0b",
        borderRadius: "0.375rem",
        marginBottom: "1rem",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{t("title")}</p>
      {state.events.map((e) => (
        <div
          key={e.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem 0",
            borderTop: "1px solid #f59e0b",
          }}
        >
          <span>
            {e.categoryId}: {e.total} {e.currency} (threshold {e.threshold} {e.currency})
          </span>
          <Button size="sm" variant="ghost" onClick={() => dismiss(e.id)}>
            {t("dismissed")} {tCommon("close")}
          </Button>
        </div>
      ))}
    </div>
  );
}
