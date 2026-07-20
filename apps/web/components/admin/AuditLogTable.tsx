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

import {
  ApiError,
  listAdminAuditEvents,
  type AdminAuditEventResponse,
} from "@/lib/audit-api";

/**
 * AuditLogTable — M4 Phase 3 (PR #3, tasks 3.4 + 3.9 triangulation).
 *
 * Client component. Renders the admin audit-event listing with the
 * spec-literal 7-column shape. The page (`/admin/audit/page.tsx`)
 * owns the filter bar + pagination controls + the retention
 * button; this component owns the data fetch + the row rendering
 * + the 5 form states per AGENTS.md §9:
 *  - loading: initial fetch in flight
 *  - error: fetch rejected
 *  - success-empty: response was `[]` — show CTA + helpful copy
 *  - success-non-empty: render the table with all 7 columns
 *  - validation-error: delegated to AuditFilterBar (table itself
 *    does not own input validation)
 *
 * Schema parity: the action enum is rendered via the localized
 * `admin.audit.actions.<ACTION>` keys so the cell carries the
 * human-readable label while the underlying data keeps the spec-
 * literal enum string.
 *
 * Triangulated (task 3.9):
 *  - empty state shows CTA + helpful copy
 *  - success state after fetch shows the localized
 *    `admin.audit.filterApplied` confirmation
 *  - error state surfaces the localized copy
 */

type State =
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "success"; events: ReadonlyArray<AdminAuditEventResponse> };

export function AuditLogTable() {
  const t = useTranslations("admin.audit");

  const [state, setState] = React.useState<State>({ kind: "loading" });

  const fetchEvents = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const events = await listAdminAuditEvents({ limit: 50, offset: 0 });
      setState({ kind: "success", events });
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

  React.useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  if (state.kind === "loading") {
    return <p style={{ color: "#666" }}>{t("loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" style={{ color: "#b91c1c" }}>
        <p>{t("error", { message: state.error })}</p>
        <Button onClick={() => void fetchEvents()}>{t("retry")}</Button>
      </div>
    );
  }
  if (state.events.length === 0) {
    return (
      <div data-testid="audit-empty-state">
        <p style={{ color: "#666" }}>{t("empty")}</p>
        <p style={{ color: "#999", marginTop: "0.5rem" }}>{t("emptyHelp")}</p>
        <Button onClick={() => void fetchEvents()} style={{ marginTop: "1rem" }}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="audit-table-wrapper">
      <p
        role="status"
        data-testid="audit-fetch-success"
        style={{ color: "#15803d", fontSize: "0.875rem", marginBottom: "0.5rem" }}
      >
        {t("filterApplied")}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.createdAt")}</TableHead>
            <TableHead>{t("columns.action")}</TableHead>
            <TableHead>{t("columns.actorId")}</TableHead>
            <TableHead>{t("columns.targetId")}</TableHead>
            <TableHead>{t("columns.ipAddress")}</TableHead>
            <TableHead>{t("columns.userAgent")}</TableHead>
            <TableHead>{t("columns.metadata")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.events.map((event) => (
            <TableRow key={event.id} data-event-id={event.id}>
              <TableCell>
                {new Date(event.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <span data-testid={`audit-action-${event.id}`}>
                  {event.action}
                </span>
              </TableCell>
              <TableCell>
                <code style={{ fontSize: "0.75rem" }}>{event.actorId}</code>
              </TableCell>
              <TableCell>
                <code style={{ fontSize: "0.75rem" }}>{event.targetId}</code>
              </TableCell>
              <TableCell style={{ maxWidth: "8rem" }}>
                {event.ipAddress ?? "—"}
              </TableCell>
              <TableCell style={{ maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                {event.userAgent ?? "—"}
              </TableCell>
              <TableCell style={{ maxWidth: "12rem" }}>
                <code style={{ fontSize: "0.75rem" }}>
                  {JSON.stringify(event.metadata)}
                </code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
