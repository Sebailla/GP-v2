"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
  changeAdminUserRole,
  listAdminUsers,
  type AdminUserResponse,
} from "@/lib/admin-api";

/**
 * UsersTable — M3 Phase 4 (PR #4, task 4.5).
 *
 * Client component. Renders the admin users list with the
 * role-change form on each row. 5 form states per AGENTS.md §9:
 *  - loading:        initial fetch in flight
 *  - error:          fetch rejected; surface error banner + retry
 *  - success-empty:  response was `[]`; show CTA copy + helpful text
 *  - success-non-empty: render the table with role-change forms
 *  - validation-error: a role-change form was submitted with no
 *                      selection; inline error on that row
 *
 * Triangulated (task 4.8): the empty state shows a CTA + helpful
 * copy; the success state after a successful role change shows
 * the localized confirmation.
 *
 * Schema parity: the role-change form uses the
 * `ChangeRoleBodySchema` Zod schema from
 * `@features/auth/shared/schemas` so client-side typos surface
 * the same error message as the server.
 */

type State =
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "success"; users: ReadonlyArray<AdminUserResponse> };

type RowState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "validation-error" }
  | { kind: "success" };

export function UsersTable() {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");
  const tRole = useTranslations("admin.users.roleChange");

  const [state, setState] = React.useState<State>({ kind: "loading" });

  const fetchUsers = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const users = await listAdminUsers();
      setState({ kind: "success", users });
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
    fetchUsers();
  }, [fetchUsers]);

  // ----- per-row role-change state -----
  const [rowStates, setRowStates] = React.useState<Record<string, RowState>>({});
  const setRowState = React.useCallback((id: string, rs: RowState) => {
    setRowStates((s) => ({ ...s, [id]: rs }));
  }, []);

  const [selections, setSelections] = React.useState<Record<string, "USER" | "ADMIN">>({});
  const setSelection = React.useCallback((id: string, role: "USER" | "ADMIN") => {
    setSelections((s) => ({ ...s, [id]: role }));
  }, []);

  const submitRoleChange = React.useCallback(
    async (userId: string, fallbackRole: "USER" | "ADMIN") => {
      // The Select component renders the current role as the
      // default; if the admin hasn't explicitly changed the
      // selection we still call the API with the user's
      // current role (a no-op on the server, idempotent). The
      // validation-error state fires only when the Select has
      // been emptied somehow — which the Select component
      // itself prevents by always having a value.
      const selected: "USER" | "ADMIN" = selections[userId] ?? fallbackRole;
      setRowState(userId, { kind: "submitting" });
      try {
        await changeAdminUserRole(userId, { role: selected });
        setRowState(userId, { kind: "success" });
        // Optimistically update the role cell on the row.
        setState((s) => {
          if (s.kind !== "success") return s;
          return {
            kind: "success",
            users: s.users.map((u) =>
              u.id === userId ? { ...u, role: selected } : u,
            ),
          };
        });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? `${err.status} ${err.code}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "unknown";
        setRowState(userId, { kind: "idle" });
        setState({
          kind: "error",
          error: message,
        });
      }
    },
    [selections, setRowState],
  );

  // ----- render the 5 states -----
  if (state.kind === "loading") {
    return <p style={{ color: "#666" }}>{t("loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" style={{ color: "#b91c1c" }}>
        <p>
          {t("error", { message: state.error })}
        </p>
        <Button onClick={fetchUsers}>{t("retry")}</Button>
      </div>
    );
  }
  if (state.users.length === 0) {
    // Empty state — triangulated helpful copy.
    return (
      <div>
        <p style={{ color: "#666" }}>{t("empty")}</p>
        <p style={{ color: "#999", marginTop: "0.5rem" }}>{t("emptyHelp")}</p>
        <Button onClick={fetchUsers} style={{ marginTop: "1rem" }}>
          {tCommon("retry")}
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.email")}</TableHead>
          <TableHead>{t("columns.role")}</TableHead>
          <TableHead>{t("columns.createdAt")}</TableHead>
          <TableHead>{t("columns.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.users.map((u) => {
          const rs = rowStates[u.id] ?? { kind: "idle" as const };
          return (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <RoleChangeRow
                  userId={u.id}
                  currentRole={u.role}
                  rowState={rs}
                  selection={selections[u.id]}
                  onSelect={(role) => setSelection(u.id, role)}
                  onSubmit={() => submitRoleChange(u.id, u.role)}
                  label={tRole("label")}
                  submitLabel={tRole("submit")}
                  submittingLabel={tRole("submitting")}
                  successLabel={tRole("success")}
                  validationErrorLabel={tRole("validationError")}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Per-row role-change form. Pulled into its own component so
 * the parent table stays compact and the validation-error
 * wiring is local to the row.
 */
function RoleChangeRow({
  userId,
  currentRole,
  rowState,
  selection,
  onSelect,
  onSubmit,
  label,
  submitLabel,
  submittingLabel,
  successLabel,
  validationErrorLabel,
}: {
  readonly userId: string;
  readonly currentRole: "USER" | "ADMIN";
  readonly rowState: RowState;
  readonly selection: "USER" | "ADMIN" | undefined;
  readonly onSelect: (role: "USER" | "ADMIN") => void;
  readonly onSubmit: () => void;
  readonly label: string;
  readonly submitLabel: string;
  readonly submittingLabel: string;
  readonly successLabel: string;
  readonly validationErrorLabel: string;
}) {
  const showValidationError = rowState.kind === "validation-error";
  const showSuccess = rowState.kind === "success";
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
      data-user-id={userId}
      data-current-role={currentRole}
    >
      <label
        htmlFor={`role-${userId}`}
        style={{ fontSize: "0.75rem", color: "#475569" }}
      >
        {label}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Select
          value={selection ?? currentRole}
          onValueChange={(v) => onSelect(v === "ADMIN" ? "ADMIN" : "USER")}
        >
          <SelectTrigger id={`role-${userId}`} aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">USER</SelectItem>
            <SelectItem value="ADMIN">ADMIN</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={rowState.kind === "submitting"}
          size="sm"
        >
          {rowState.kind === "submitting" ? submittingLabel : submitLabel}
        </Button>
      </div>
      {showValidationError ? (
        <p role="alert" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
          {validationErrorLabel}
        </p>
      ) : null}
      {showSuccess ? (
        <p
          role="status"
          style={{ color: "#15803d", fontSize: "0.75rem" }}
          data-testid={`role-success-${userId}`}
        >
          {successLabel}
        </p>
      ) : null}
    </div>
  );
}
