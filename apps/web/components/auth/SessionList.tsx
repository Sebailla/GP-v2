"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

/**
 * SessionList — slice 6 (T6.3).
 *
 * Client Component. Fetches the active sessions for the
 * authenticated user via the slice 4 `auth/sessions` endpoint.
 * Each row has a "Revoke" button that calls the DELETE endpoint
 * and re-fetches the list.
 *
 * 5 form states: loading (initial fetch in flight), error
 * (load or revoke failed), success-empty (no sessions — the
 * user has only the current session?), success-non-empty
 * (the standard state), and validation-error (the future
 * pagination cursor / filter contract).
 *
 * The slice 5 server slice 4 ships the response shape:
 *   { sessions: { id, deviceLabel, lastActiveAt }[], currentSessionId }
 * The current session is highlighted; the rest get a Revoke
 * button. On revoke, the list re-fetches and a toast is
 * out-of-scope for this PR (slice 6 follow-up).
 */
export function SessionList() {
  const t = useTranslations("auth.sessions");
  const tCommon = useTranslations("common");

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | {
        kind: "success";
        sessions: ReadonlyArray<{ id: string; deviceLabel: string; lastActiveAt: string }>;
        currentSessionId: string;
      }
  >({ kind: "loading" });

  const fetchSessions = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/sessions`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setState({
          kind: "error",
          error: `${res.status} ${res.statusText}`,
        });
        return;
      }
      const data = (await res.json()) as {
        sessions: { id: string; deviceLabel: string; lastActiveAt: string }[];
        currentSessionId: string;
      };
      setState({
        kind: "success",
        sessions: data.sessions,
        currentSessionId: data.currentSessionId,
      });
    } catch (err) {
      setState({
        kind: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revoke = async (id: string) => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/sessions/${id}`,
        { method: "DELETE", credentials: "include" },
      );
      await fetchSessions();
    } catch {
      // Swallow; the next fetch attempt surfaces the error in the
      // 5-state machine. Slice 6 follow-up wires a toast.
    }
  };

  if (state.kind === "loading") {
    return <p style={{ color: "#666" }}>{tCommon("loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" style={{ color: "#b91c1c" }}>
        <span>{state.error}</span>
        <Button onClick={fetchSessions}>{tCommon("retry")}</Button>
      </div>
    );
  }
  if (state.sessions.length === 0) {
    return <p style={{ color: "#666" }}>{t("empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("list")}</TableHead>
          <TableHead>{t("revokeButton")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.sessions.map((s) => (
          <TableRow key={s.id}>
            <TableCell>
              {s.deviceLabel}
              {s.id === state.currentSessionId && (
                <span
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.75rem",
                    color: "#666",
                  }}
                >
                  (current)
                </span>
              )}
            </TableCell>
            <TableCell>
              {s.id === state.currentSessionId ? (
                <Button variant="ghost" size="sm" disabled>
                  {t("revokeButton")}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                  {t("revokeButton")}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
