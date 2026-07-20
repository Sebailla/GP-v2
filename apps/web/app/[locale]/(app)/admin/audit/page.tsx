import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin/AdminNav";
import { AuditFilterBar } from "@/components/admin/AuditFilterBar";
import { AuditLogTable } from "@/components/admin/AuditLogTable";
import { AuditRetentionButton } from "@/components/admin/AuditRetentionButton";

/**
 * (app)/admin/audit page — M4 Phase 3 (PR #3, task 3.4) + JD-3
 * fix (JD-driven correction round 1, PR #4 follow-up).
 *
 * Server Component. Composes the audit-log surface:
 *  - `<AdminNav active="audit" />` — top-level admin nav.
 *  - `<AuditFilterBar />` — client component, 4 filter inputs +
 *    pagination controls. Wired in JD-3 (was previously built +
 *    tested but NEVER imported/mounted here → the filter UI was
 *    dead-code). The bar calls `router.replace` on Apply/Reset/Page
 *    to push URL searchParams; this page re-reads them on every
 *    request (server component, dynamic rendering) and forwards
 *    them to `<AuditLogTable />` as `filters` + `offset` + `limit`.
 *  - `<AuditLogTable />` — client component, audit-event listing
 *    + 5 form states. Consumes `filters`/`offset`/`limit` props
 *    (JD-3 fix) so the user's filter input lands in the
 *    `listAdminAuditEvents` call.
 *  - `<AuditRetentionButton />` — client component, dry-run + real
 *    purge buttons + confirm dialog.
 *
 * The layout (`apps/web/app/[locale]/(app)/admin/layout.tsx`)
 * already guaranteed an ADMIN session; this page is purely
 * presentational plus URL searchParam parsing.
 */

const PAGE_SIZE = 50;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    actorId?: string;
    targetId?: string;
    action?: string;
    since?: string;
    until?: string;
    offset?: string;
  }>;
}

export const dynamic = "force-dynamic";

/**
 * Parse + coerce URL searchParams into the shape AuditLogTable
 * + AuditFilterBar expect. Returns `undefined` for empty/missing
 * values so the underlying list call forwards `undefined` (which
 * Prisma translates to "no constraint on this column").
 */
function parseFiltersFromSearchParams(
  searchParams: {
    actorId?: string;
    targetId?: string;
    action?: string;
    since?: string;
    until?: string;
    offset?: string;
  },
): {
  filters: {
    actorId?: string;
    targetId?: string;
    action?: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
    since?: Date | undefined;
    until?: Date | undefined;
  };
  offset: number;
  limit: number;
} {
  const actionRaw = searchParams.action;
  const action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE" | undefined =
    actionRaw === "REVOKE_SESSION" ||
    actionRaw === "REVOKE_ALL_SESSIONS" ||
    actionRaw === "CHANGE_ROLE"
      ? actionRaw
      : undefined;
  const offsetParsed = (() => {
    if (searchParams.offset === undefined) return 0;
    const n = Number.parseInt(searchParams.offset, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();
  // Coerce date strings to Date. Invalid dates fall through to
  // undefined so the boundary check (ListAuditQuerySchema) flags
  // them — the server's ZodValidationPipe is the single source
  // of truth per AGENTS.md §8.
  const sinceDate =
    searchParams.since !== undefined && searchParams.since !== ""
      ? new Date(searchParams.since)
      : undefined;
  const untilDate =
    searchParams.until !== undefined && searchParams.until !== ""
      ? new Date(searchParams.until)
      : undefined;
  return {
    filters: {
      ...(searchParams.actorId !== undefined && searchParams.actorId !== ""
        ? { actorId: searchParams.actorId }
        : {}),
      ...(searchParams.targetId !== undefined && searchParams.targetId !== ""
        ? { targetId: searchParams.targetId }
        : {}),
      ...(action !== undefined ? { action } : {}),
      ...(sinceDate !== undefined && !Number.isNaN(sinceDate.getTime())
        ? { since: sinceDate }
        : {}),
      ...(untilDate !== undefined && !Number.isNaN(untilDate.getTime())
        ? { until: untilDate }
        : {}),
    },
    offset: offsetParsed,
    limit: PAGE_SIZE,
  };
}

export default async function AdminAuditPage({ params, searchParams }: PageProps) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const { filters, offset, limit } = parseFiltersFromSearchParams(sp);
  const t = await getTranslations("admin.audit");
  // Convert the since/until dates back to ISO strings for the bar's
  // initial filter inputs (the bar's inputs are <input type=date>
  // backed by `value` strings, not Date objects).
  const sinceStr =
    filters.since instanceof Date ? filters.since.toISOString().slice(0, 10) : "";
  const untilStr =
    filters.until instanceof Date ? filters.until.toISOString().slice(0, 10) : "";
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <AdminNav active="audit" locale={locale} />
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{t("title")}</h1>
        <p style={{ color: "#666" }}>{t("description")}</p>
      </header>
      <AuditFilterBar
        initialFilters={{
          actorId: filters.actorId ?? "",
          targetId: filters.targetId ?? "",
          action: filters.action ?? "",
          since: sinceStr,
          until: untilStr,
        }}
        initialOffset={offset}
        initialLimit={limit}
        pageSize={PAGE_SIZE}
        totalPages={1}
      />
      <section style={{ marginBottom: "2rem" }}>
        <AuditLogTable filters={filters} offset={offset} limit={limit} />
      </section>
      <section>
        <AuditRetentionButton />
      </section>
    </main>
  );
}
