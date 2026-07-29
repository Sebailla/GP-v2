"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { ApiError, changeAdminUserRole } from "@/lib/admin-api";

/**
 * ChangeRoleForm — M3 Phase 4 (PR #4, task 4.5).
 *
 * Client component. Renders a single role-change form for the
 * user detail page. Same Zod schema parity as the table-row
 * variant. On success the form shows the localized confirmation.
 *
 * The form is intentionally focused: the row-level form lives
 * inside UsersTable; this component is the detail-page variant.
 */
export interface ChangeRoleFormProps {
  readonly userId: string;
  readonly currentRole: "USER" | "ADMIN";
  readonly labels: {
    readonly label: string;
    readonly submit: string;
  };
}

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "validation-error" }
  | { kind: "success" };

export function ChangeRoleForm({ userId, currentRole, labels }: ChangeRoleFormProps) {
  const tRole = useTranslations("admin.users.roleChange");
  const [selection, setSelection] = React.useState<"USER" | "ADMIN">(currentRole);
  const [state, setState] = React.useState<FormState>({ kind: "idle" });

  const submit = React.useCallback(async () => {
    setState({ kind: "submitting" });
    if (selection === undefined) {
      setState({ kind: "validation-error" });
      return;
    }
    try {
      await changeAdminUserRole(userId, { role: selection });
      setState({ kind: "success" });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.status} ${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "unknown";
      // Surface a generic error inline (no per-form error key in
      // the catalog; the page-level error banner is the canonical
      // sink for now).
      console.error("changeAdminUserRole failed:", message);
      setState({ kind: "idle" });
    }
  }, [selection, userId]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
      data-user-id={userId}
    >
      <label
        htmlFor={`detail-role-${userId}`}
        style={{ fontSize: "0.875rem", color: "#475569" }}
      >
        {tRole("label")}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Select
          value={selection}
          onValueChange={(v) => setSelection(v === "ADMIN" ? "ADMIN" : "USER")}
        >
          <SelectTrigger id={`detail-role-${userId}`} aria-label={labels.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">USER</SelectItem>
            <SelectItem value="ADMIN">ADMIN</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="submit"
          disabled={state.kind === "submitting"}
          data-testid={`detail-role-submit-${userId}`}
        >
          {state.kind === "submitting" ? tRole("submitting") : tRole("submit")}
        </Button>
      </div>
      {state.kind === "validation-error" ? (
        <p role="alert" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
          {tRole("validationError")}
        </p>
      ) : null}
      {state.kind === "success" ? (
        <p role="status" style={{ color: "#15803d", fontSize: "0.75rem" }}>
          {tRole("success")}
        </p>
      ) : null}
    </form>
  );
}
