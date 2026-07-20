"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  ApiError,
  dryRunPurgeAuditEvents,
  purgeAuditEvents,
} from "@/lib/audit-api";

/**
 * AuditRetentionButton — M4 Phase 3 (PR #3, tasks 3.4 + 3.7).
 *
 * Client component. The retention operator surface: owns the
 * `olderThanDays` input, the dry-run button, and the real purge
 * button (with a confirm dialog that surfaces the matched count).
 *
 * The dry-run button ALWAYS runs first to populate the matched
 * count for the confirm dialog — per design D4 single-endpoint
 * dual-mode contract (the API itself doesn't carry state, so the
 * client must round-trip through `dryRun` then `purge`). This
 * mirrors the operator runbook (`docs/operations/audit-retention-
 * runbook.md` — landing in PR #4): "always dry-run first, then
 * confirm".
 *
 * 5 form states per AGENTS.md §9:
 *  - empty: initial mount — no dry-run has been run
 *  - validation-error: olderThanDays empty / < 1
 *  - loading: dry-run or purge in flight
 *  - success: dry-run returned matched (renders the count) or
 *    purge completed (renders the deleted count)
 *  - error: API rejected with an `ApiError` or unknown exception
 *
 * Schema parity: the olderThanDays form validates client-side
 * before dispatch (≥ 1). The server's ZodValidationPipe enforces
 * the same minimum so client-side typos surface the same error.
 */

type DryRunState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "success"; matched: number }
  | { kind: "error"; message: string };

type PurgeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; deleted: number }
  | { kind: "error"; message: string };

function parseOlderThanDays(raw: string): { ok: true; value: number } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false };
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1) return { ok: false };
  return { ok: true, value: n };
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError
    ? `${err.status} ${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : "unknown";
}

export function AuditRetentionButton() {
  const t = useTranslations("admin.audit.retention");
  const tCommon = useTranslations("common");

  const [olderThanDaysRaw, setOlderThanDaysRaw] = React.useState<string>("90");
  const [validationError, setValidationError] = React.useState<boolean>(false);
  const [dryRun, setDryRun] = React.useState<DryRunState>({ kind: "empty" });
  const [purge, setPurge] = React.useState<PurgeState>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);

  const handleDryRun = React.useCallback(async () => {
    const parsed = parseOlderThanDays(olderThanDaysRaw);
    if (!parsed.ok) {
      setValidationError(true);
      setDryRun({ kind: "empty" });
      return;
    }
    setValidationError(false);
    setDryRun({ kind: "loading" });
    try {
      const result = await dryRunPurgeAuditEvents({ olderThanDays: parsed.value });
      setDryRun({ kind: "success", matched: result.matched });
    } catch (err) {
      setDryRun({ kind: "error", message: errorMessage(err) });
    }
  }, [olderThanDaysRaw]);

  const handlePurgeClick = React.useCallback(() => {
    const parsed = parseOlderThanDays(olderThanDaysRaw);
    if (!parsed.ok) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setConfirmOpen(true);
  }, [olderThanDaysRaw]);

  const handlePurgeConfirm = React.useCallback(async () => {
    const parsed = parseOlderThanDays(olderThanDaysRaw);
    if (!parsed.ok) {
      setValidationError(true);
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(false);
    setPurge({ kind: "loading" });
    try {
      const result = await purgeAuditEvents({ olderThanDays: parsed.value });
      setPurge({ kind: "success", deleted: result.deleted });
    } catch (err) {
      setPurge({ kind: "error", message: errorMessage(err) });
    }
  }, [olderThanDaysRaw]);

  const handlePurgeCancel = React.useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const parsedForDialog = parseOlderThanDays(olderThanDaysRaw);
  const daysForDialog = parsedForDialog.ok ? parsedForDialog.value : 0;
  const matchedForDialog = dryRun.kind === "success" ? dryRun.matched : 0;

  return (
    <section
      aria-label={t("title")}
      data-testid="retention-section"
      style={{
        display: "grid",
        gap: "0.75rem",
        padding: "1rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
      }}
    >
      <header>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>{t("title")}</h2>
        <p style={{ margin: "0.25rem 0 0 0", color: "#475569", fontSize: "0.875rem" }}>
          {t("description")}
        </p>
      </header>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "end" }}>
        <div style={{ flex: 1 }}>
          <label
            htmlFor="retention-older-than-days"
            style={{ display: "block", fontSize: "0.75rem", color: "#475569" }}
          >
            {t("olderThanDaysLabel")}
          </label>
          <Input
            id="retention-older-than-days"
            type="number"
            min={1}
            value={olderThanDaysRaw}
            placeholder={t("olderThanDaysPlaceholder")}
            onChange={(e) => setOlderThanDaysRaw(e.target.value)}
            aria-invalid={validationError}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleDryRun()}
          disabled={dryRun.kind === "loading" || purge.kind === "loading"}
          data-testid="retention-dry-run"
        >
          {dryRun.kind === "loading" ? t("dryRunning") : t("dryRun")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handlePurgeClick}
          disabled={purge.kind === "loading"}
          data-testid="retention-purge"
        >
          {purge.kind === "loading" ? t("purging") : t("purge")}
        </Button>
      </div>

      {validationError ? (
        <p
          role="alert"
          data-testid="retention-validation-error"
          style={{ color: "#b91c1c", fontSize: "0.875rem" }}
        >
          {t("validationError")}
        </p>
      ) : null}

      {dryRun.kind === "success" ? (
        <p
          role="status"
          data-testid="retention-dry-run-result"
          style={{
            color: dryRun.matched === 0 ? "#475569" : "#15803d",
            fontSize: "0.875rem",
          }}
        >
          {dryRun.matched === 0
            ? t("dryRunResultZero")
            : t("dryRunResult", { matched: dryRun.matched })}
        </p>
      ) : null}

      {dryRun.kind === "error" ? (
        <p
          role="alert"
          data-testid="retention-error"
          style={{ color: "#b91c1c", fontSize: "0.875rem" }}
        >
          {t("error", { message: dryRun.message })}
        </p>
      ) : null}

      {purge.kind === "success" ? (
        <p
          role="status"
          data-testid="retention-purge-result"
          style={{
            color: purge.deleted === 0 ? "#475569" : "#15803d",
            fontSize: "0.875rem",
          }}
        >
          {purge.deleted === 0
            ? t("purgeResultZero")
            : t("purgeResult", { deleted: purge.deleted })}
        </p>
      ) : null}

      {purge.kind === "error" ? (
        <p
          role="alert"
          data-testid="retention-error"
          style={{ color: "#b91c1c", fontSize: "0.875rem" }}
        >
          {t("error", { message: purge.message })}
        </p>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("purgeConfirm", { matched: matchedForDialog, days: daysForDialog })}
          data-testid="retention-confirm-dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              maxWidth: "24rem",
              display: "grid",
              gap: "1rem",
            }}
          >
            <p style={{ margin: 0 }}>{t("purgeConfirm", { matched: matchedForDialog, days: daysForDialog })}</p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="outline" onClick={handlePurgeCancel}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handlePurgeConfirm()}
                data-testid="retention-purge-confirm"
              >
                {t("purge")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
