"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import {
  ApiError,
  listAdminSessions,
  revokeAdminSession,
  revokeAllAdminSessions,
  type AdminSessionResponse,
} from "@/lib/admin-api";
import { ListSessionsQuerySchema } from "@/lib/admin-api";

/**
 * SessionsTable — M3 Phase 4 (PR #4, task 4.5).
 *
 * Client component. Lists the active sessions for an admin-given
 * userId and exposes two revoke actions:
 *  - per-row revoke (DELETE /admin/sessions/:sessionId)
 *  - bulk revoke all (DELETE /admin/sessions/user/:userId)
 *
 * 5 form states per AGENTS.md §9:
 *  - validation-error: userId is empty / malformed; show inline error
 *  - loading:          fetch in flight after a valid submit
 *  - error:            fetch rejected; show error banner + retry
 *  - success-empty:    response was `[]`; show "no sessions" copy
 *  - success-non-empty: render the table with per-row revoke
 *
 * Triangulated (task 4.8):
 *  - empty state shows helpful copy
 *  - successful single revoke shows the localized confirmation
 *  - successful bulk revoke shows the localized confirmation
 *
 * Schema parity: the userId form uses the `ListSessionsQuerySchema`
 * Zod schema from `@features/auth/shared/schemas` so client-side
 * validation mirrors the server.
 */

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "success"; sessions: ReadonlyArray<AdminSessionResponse> };

type FlashState =
  | { kind: "none" }
  | { kind: "single" }
  | { kind: "all" };

export function SessionsTable() {
  const t = useTranslations("admin.sessions");
  const tCommon = useTranslations("common");

  const [userId, setUserId] = React.useState<string>("");
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<FlashState>({ kind: "none" });
  const [busySessionId, setBusySessionId] = React.useState<string | null>(null);
  const [busyAll, setBusyAll] = React.useState<boolean>(false);

  const fetchSessions = React.useCallback(async (id: string) => {
    setState({ kind: "loading" });
    setValidationError(null);
    try {
      const sessions = await listAdminSessions({ userId: id });
      setState({ kind: "success", sessions });
    } catch (err) {
      setState({
        kind: "error",
        error:
          err instanceof ApiError
            ? `${err.status} ${err.code}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "unknown",
      });
    }
  }, []);

  const handleLoad = React.useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      // Validate via the same Zod schema the server uses.
      const parsed = ListSessionsQuerySchema.safeParse({ userId });
      if (!parsed.success) {
        setValidationError(t("validationError"));
        setState({ kind: "idle" });
        return;
      }
      setValidationError(null);
      void fetchSessions(parsed.data.userId);
    },
    [userId, fetchSessions, t],
  );

  const handleRevokeOne = React.useCallback(
    async (sessionId: string) => {
      setBusySessionId(sessionId);
      setFlash({ kind: "none" });
      try {
        await revokeAdminSession(sessionId);
        // Optimistic: remove the row from the visible state.
        setState((s) => {
          if (s.kind !== "success") return s;
          return {
            kind: "success",
            sessions: s.sessions.filter((row) => row.id !== sessionId),
          };
        });
        setFlash({ kind: "single" });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? `${err.status} ${err.code}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "unknown";
        setState({ kind: "error", error: message });
      } finally {
        setBusySessionId(null);
      }
    },
    [],
  );

  const handleRevokeAll = React.useCallback(async () => {
    setBusyAll(true);
    setFlash({ kind: "none" });
    try {
      await revokeAllAdminSessions(userId);
      setState((s) => {
        if (s.kind !== "success") return s;
        return { kind: "success", sessions: [] };
      });
      setFlash({ kind: "all" });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.status} ${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "unknown";
      setState({ kind: "error", error: message });
    } finally {
      setBusyAll(false);
    }
  }, [userId]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <form
        onSubmit={handleLoad}
        style={{ display: "flex", gap: "0.5rem", alignItems: "end" }}
      >
        <div style={{ flex: 1 }}>
          <label
            htmlFor="admin-sessions-userId"
            style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}
          >
            {t("userIdLabel")}
          </label>
          <Input
            id="admin-sessions-userId"
            value={userId}
            placeholder={t("userIdPlaceholder")}
            onChange={(e) => setUserId(e.target.value)}
            aria-invalid={validationError !== null}
            aria-describedby={validationError !== null ? "admin-sessions-validation" : undefined}
          />
        </div>
        <Button type="button" onClick={() => handleLoad()}>
          {t("load")}
        </Button>
      </form>
      {validationError !== null ? (
        <p
          id="admin-sessions-validation"
          role="alert"
          style={{ color: "#b91c1c", fontSize: "0.875rem" }}
        >
          {validationError}
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <p style={{ color: "#666" }}>{t("loading")}</p>
      ) : null}

      {state.kind === "error" ? (
        <div role="alert" style={{ color: "#b91c1c" }}>
          <p>{t("error", { message: state.error })}</p>
          <Button onClick={() => void fetchSessions(userId)}>{t("retry")}</Button>
        </div>
      ) : null}

      {state.kind === "success" && state.sessions.length === 0 ? (
        <p style={{ color: "#666" }}>{t("empty")}</p>
      ) : null}

      {state.kind === "success" && state.sessions.length > 0 ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRevokeAll()}
              disabled={busyAll}
            >
              {t("revokeAll")}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.id")}</TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
                <TableHead>{t("columns.lastActiveAt")}</TableHead>
                <TableHead>{t("columns.userAgent")}</TableHead>
                <TableHead>{t("columns.ipAddress")}</TableHead>
                <TableHead>{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.sessions.map((s) => (
                <TableRow key={s.id} data-session-id={s.id}>
                  <TableCell>
                    <code style={{ fontSize: "0.75rem" }}>{s.id}</code>
                  </TableCell>
                  <TableCell>{new Date(s.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(s.lastActiveAt).toLocaleString()}</TableCell>
                  <TableCell style={{ maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.userAgent ?? "—"}
                  </TableCell>
                  <TableCell>{s.ipAddress ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleRevokeOne(s.id)}
                      disabled={busySessionId === s.id}
                    >
                      {t("revoke")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}

      {flash.kind === "single" ? (
        <p role="status" style={{ color: "#15803d" }}>
          {t("revokeSuccess")}
        </p>
      ) : null}
      {flash.kind === "all" ? (
        <p role="status" style={{ color: "#15803d" }}>
          {t("revokeAllSuccess")}
        </p>
      ) : null}

      {state.kind === "idle" ? (
        <p style={{ color: "#999", fontSize: "0.75rem" }}>{tCommon("loading")}</p>
      ) : null}
    </div>
  );
}
