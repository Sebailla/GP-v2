"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * AdminNav — M3 Phase 4 (PR #4, task 4.5).
 *
 * Top-level navigation for the `/[locale]/(app)/admin/*` route
 * group. Pure presentational component — no fetch, no state.
 * The active tab is highlighted via `aria-current="page"` (the
 * canonical a11y signal for the current page in a nav).
 *
 * Links point at the locale-prefixed admin routes. The
 * `back-to-app` link lands on `/{locale}/(app)` so the admin
 * can return to the user surface without logging out.
 *
 * Locale handling: the parent page is the source of truth for
 * the active locale (it reads it from `params`). The nav accepts
 * a `locale` prop so the link hrefs are locale-correct without
 * requiring a server-only `useLocale()` call.
 */

export type AdminNavTab = "users" | "sessions";

export interface AdminNavProps {
  readonly active: AdminNavTab;
  readonly locale: string;
}

export function AdminNav({ active, locale }: AdminNavProps) {
  const t = useTranslations("admin.nav");

  return (
    <nav
      aria-label={t("users")}
      style={{
        display: "flex",
        gap: "1rem",
        padding: "1rem 0",
        borderBottom: "1px solid #e5e7eb",
        marginBottom: "1.5rem",
      }}
    >
      <Link
        href={`/${locale}/admin/users`}
        aria-current={active === "users" ? "page" : undefined}
        style={{
          padding: "0.5rem 0.75rem",
          textDecoration: "none",
          fontWeight: active === "users" ? 600 : 400,
          color: active === "users" ? "#0f172a" : "#475569",
        }}
      >
        {t("users")}
      </Link>
      <Link
        href={`/${locale}/admin/sessions`}
        aria-current={active === "sessions" ? "page" : undefined}
        style={{
          padding: "0.5rem 0.75rem",
          textDecoration: "none",
          fontWeight: active === "sessions" ? 600 : 400,
          color: active === "sessions" ? "#0f172a" : "#475569",
        }}
      >
        {t("sessions")}
      </Link>
      <Link
        href={`/${locale}/(app)`}
        style={{
          marginLeft: "auto",
          padding: "0.5rem 0.75rem",
          textDecoration: "none",
          color: "#475569",
        }}
      >
        {t("back")}
      </Link>
    </nav>
  );
}
