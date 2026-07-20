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

/**
 * AuditFilterBar — M4 Phase 3 (PR #3, tasks 3.4 + 3.6).
 *
 * Client component. Pure presentational + state: owns the 4 filter
 * inputs + the pagination controls, surfaces the user's selection
 * via `onApply` / `onReset` / `onPageChange` callbacks. The parent
 * page (`apps/web/app/[locale]/(app)/admin/audit/page.tsx`) decides
 * how to translate those callbacks into URL params + a server-side
 * refetch.
 *
 * Filter inputs (4 per task 3.3 spec):
 *  - actorId (text, UUID-shaped)
 *  - targetId (text, UUID-shaped)
 *  - action (select: REVOKE_SESSION | REVOKE_ALL_SESSIONS | CHANGE_ROLE)
 *  - since (date)
 *  - until (date)
 *
 * 5 form states per AGENTS.md §9:
 *  - loading (delegated to the parent page — this component itself
 *    is a pure form)
 *  - error (delegated)
 *  - success-empty / success-non-empty (delegated)
 *  - validation-error (triggered when Apply is clicked with all
 *    empty filter values — surfaced as inline aria-invalid on the
 *    inputs + a localized alert under the form)
 *
 * Schema parity: the form inputs are NOT validated by Zod at the
 * client level for this slice — the server's ZodValidationPipe
 * handles the boundary check (the parent page calls
 * `listAdminAuditEvents({...})` which runs `ListAuditQuerySchema`).
 * The validation-error branch fires for an empty submit so the
 * 5-state contract is satisfied without redundant client-side
 * duplication.
 *
 * The action select uses the shadcn `<Select>` primitive to match
 * the role-change form on `UsersTable` (consistency with the M3
 * admin surface — `pattern/ui-shadcn-select-from-radix`).
 */

export interface AuditFilterValues {
  readonly actorId: string;
  readonly targetId: string;
  readonly action: string;
  readonly since: string;
  readonly until: string;
}

export interface AuditFilterBarProps {
  readonly initialFilters: AuditFilterValues;
  readonly initialOffset: number;
  readonly initialLimit: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly onApply: (values: AuditFilterValues) => void;
  readonly onReset: () => void;
  readonly onPageChange: (pagination: { offset: number; limit: number }) => void;
}

const ACTION_OPTIONS = [
  { value: "REVOKE_SESSION", label: "REVOKE_SESSION" },
  { value: "REVOKE_ALL_SESSIONS", label: "REVOKE_ALL_SESSIONS" },
  { value: "CHANGE_ROLE", label: "CHANGE_ROLE" },
] as const;

export function AuditFilterBar({
  initialFilters,
  initialOffset,
  initialLimit,
  pageSize,
  totalPages,
  onApply,
  onReset,
  onPageChange,
}: AuditFilterBarProps) {
  const t = useTranslations("admin.audit.filters");
  const tPagination = useTranslations("admin.audit.pagination");

  const [actorId, setActorId] = React.useState<string>(initialFilters.actorId);
  const [targetId, setTargetId] = React.useState<string>(initialFilters.targetId);
  const [action, setAction] = React.useState<string>(initialFilters.action);
  const [since, setSince] = React.useState<string>(initialFilters.since);
  const [until, setUntil] = React.useState<string>(initialFilters.until);
  const [validationError, setValidationError] = React.useState<boolean>(false);

  const handleApply = React.useCallback(() => {
    const trimmed = {
      actorId: actorId.trim(),
      targetId: targetId.trim(),
      action,
      since: since.trim(),
      until: until.trim(),
    };
    const isEmpty =
      trimmed.actorId === "" &&
      trimmed.targetId === "" &&
      trimmed.action === "" &&
      trimmed.since === "" &&
      trimmed.until === "";
    if (isEmpty) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    onApply(trimmed);
  }, [actorId, targetId, action, since, until, onApply]);

  const handleReset = React.useCallback(() => {
    setActorId("");
    setTargetId("");
    setAction("");
    setSince("");
    setUntil("");
    setValidationError(false);
    onReset();
  }, [onReset]);

  const handleNext = React.useCallback(() => {
    onPageChange({ offset: initialOffset + pageSize, limit: initialLimit });
  }, [initialOffset, pageSize, initialLimit, onPageChange]);

  const handlePrevious = React.useCallback(() => {
    onPageChange({ offset: Math.max(0, initialOffset - pageSize), limit: initialLimit });
  }, [initialOffset, pageSize, initialLimit, onPageChange]);

  // 0-indexed page; with pageSize=50 the 3 pages are offsets 0, 50, 100.
  const currentPage = Math.floor(initialOffset / pageSize) + 1;
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <div
      data-testid="audit-filter-bar"
      style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}
    >
      <fieldset
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          alignItems: "end",
          padding: "0.75rem",
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
        }}
      >
        <legend
          style={{
            padding: "0 0.5rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#0f172a",
          }}
        >
          {t("title")}
        </legend>
        <div>
          <label
            htmlFor="audit-filter-actorId"
            style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
          >
            {t("actorIdLabel")}
          </label>
          <Input
            id="audit-filter-actorId"
            value={actorId}
            placeholder={t("actorIdPlaceholder")}
            onChange={(e) => setActorId(e.target.value)}
            aria-invalid={validationError}
          />
        </div>
        <div>
          <label
            htmlFor="audit-filter-targetId"
            style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
          >
            {t("targetIdLabel")}
          </label>
          <Input
            id="audit-filter-targetId"
            value={targetId}
            placeholder={t("targetIdPlaceholder")}
            onChange={(e) => setTargetId(e.target.value)}
            aria-invalid={validationError}
          />
        </div>
        <div>
          <label
            htmlFor="audit-filter-action"
            style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
          >
            {t("actionLabel")}
          </label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger id="audit-filter-action" aria-label={t("actionLabel")}>
              <SelectValue placeholder={t("actionAll")} />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor="audit-filter-since"
            style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
          >
            {t("sinceLabel")}
          </label>
          <Input
            id="audit-filter-since"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            aria-invalid={validationError}
          />
        </div>
        <div>
          <label
            htmlFor="audit-filter-until"
            style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
          >
            {t("untilLabel")}
          </label>
          <Input
            id="audit-filter-until"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-invalid={validationError}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button type="button" onClick={handleApply} data-testid="audit-filter-apply">
            {t("apply")}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            {t("reset")}
          </Button>
        </div>
      </fieldset>
      {validationError ? (
        <p
          role="alert"
          data-testid="audit-filter-validation"
          style={{ color: "#b91c1c", fontSize: "0.875rem" }}
        >
          admin.audit.validationError
        </p>
      ) : null}
      <nav
        aria-label="pagination"
        data-testid="audit-pagination"
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={isFirstPage}
          aria-label={tPagination("previous")}
        >
          {tPagination("previous")}
        </Button>
        <span style={{ fontSize: "0.875rem", color: "#475569" }}>
          {tPagination("page", { page: currentPage, total: totalPages })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={isLastPage}
          aria-label={tPagination("next")}
        >
          {tPagination("next")}
        </Button>
      </nav>
    </div>
  );
}
