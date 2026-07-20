/**
 * apps/web/lib/audit-api.ts — M4 Phase 3 (PR #3, tasks 3.2).
 *
 * Typed fetch wrappers for the admin audit-log endpoints (PR #2 —
 * `apps/api/src/modules/auth/admin.controller.ts`):
 *  - GET    /admin/audit?actorId=&targetId=&action=&since=&until=&limit=&offset=
 *  - POST   /admin/audit/purge  body: { dryRun: bool, olderThanDays: number }
 *
 * Pattern mirrors `apps/web/lib/admin-api.ts`:
 *  - `credentials: "include"` carries the session cookie.
 *  - Non-2xx responses throw an `ApiError` with the server's
 *    `{ error, message }` body parsed.
 *  - `NEXT_PUBLIC_API_URL` env is the base URL (set in
 *    apps/web/.env.local for dev = http://localhost:3001).
 *
 * Wire-format types are declared here (not imported from the
 * server barrel) so the client bundle stays free of Prisma +
 * Node-only modules per the slice-1 server/client split.
 *
 * Schema parity: the request bodies / query params go through
 * Zod via `@features/auth/shared/schemas` so a client-side
 * typo gets the same error as the server (per Phase 2 PR #2's
 * `ListAuditQuerySchema` + `PurgeAuditBodySchema`).
 */

import {
  ListAuditQuerySchema,
  PurgeAuditBodySchema,
  type ListAuditQuery,
  type PurgeAuditBody,
} from "@features/auth/shared/schemas";

import { ApiError } from "./admin-api";

export {
  ListAuditQuerySchema,
  PurgeAuditBodySchema,
  type ListAuditQuery,
  type PurgeAuditBody,
};

/**
 * Response shapes — verbatim projections from
 * `apps/api/src/modules/auth/admin.controller.ts#listAuditEvents`
 * + `purgeAuditEvents`. The 8-field list shape is spec-literal
 * per `openspec/specs/audit-log-ui/spec.md` "List Audit Events".
 */

export interface AdminAuditEventResponse {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
  readonly createdAt: string;
  readonly metadata: unknown;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface PurgeAuditDryRunResponse {
  readonly matched: number;
  readonly wouldDelete: number;
}

export interface PurgeAuditRealResponse {
  readonly matched: number;
  readonly deleted: number;
}

/**
 * Re-export `ApiError` so callers can switch on `instanceof ApiError`
 * (per M3 admin-api precedent) — single source of error shape across
 * the web client's admin surface.
 */
export { ApiError } from "./admin-api";

function apiBase(): string {
  // `NEXT_PUBLIC_*` is inlined at build time; defaults to the dev
  // API port (apps/api runs on 3001) so the e2e + dev harness works.
  const raw = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

function readSessionToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = "authjs.session-token=";
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  return cookie === undefined ? null : decodeURIComponent(cookie.slice(prefix.length));
}

/**
 * Build the request header bag. Re-exposed for the test surface
 * so the same Bearer-token contract is verified at the unit level
 * (matches M3 admin-api.ts#authHeader pattern; per task 3.2 the
 * audit-api module owns its own authHeader).
 */
export function authHeader(): Record<string, string> {
  const token = readSessionToken();
  return {
    "Content-Type": "application/json",
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
  };
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const json = (await response.json()) as { error?: unknown; message?: unknown };
    return {
      code: typeof json.error === "string" ? json.error : "UNKNOWN",
      message: typeof json.message === "string" ? json.message : response.statusText,
    };
  } catch {
    return { code: "UNKNOWN", message: response.statusText };
  }
}

/**
 * GET /admin/audit?actorId=&targetId=&action=&since=&until=&limit=&offset=
 *
 * Zod-parses the query bag via `ListAuditQuerySchema` so a client-side
 * typo (e.g. `action=GOD`) surfaces the same error as the server's
 * ZodValidationPipe. The Zod schema coerces `since` / `until` from
 * strings to `Date`; we forward the `Date#toISOString()` form so the
 * server's `z.coerce.date()` round-trips cleanly.
 */
export async function listAdminAuditEvents(
  query: Partial<ListAuditQuery> = {},
): Promise<ReadonlyArray<AdminAuditEventResponse>> {
  const parsed = ListAuditQuerySchema.parse(query);
  const url = new URL(`${apiBase()}/admin/audit`);
  url.searchParams.set("limit", String(parsed.limit));
  url.searchParams.set("offset", String(parsed.offset));
  if (parsed.actorId !== undefined) url.searchParams.set("actorId", parsed.actorId);
  if (parsed.targetId !== undefined) url.searchParams.set("targetId", parsed.targetId);
  if (parsed.action !== undefined) url.searchParams.set("action", parsed.action);
  if (parsed.since !== undefined) url.searchParams.set("since", parsed.since.toISOString());
  if (parsed.until !== undefined) url.searchParams.set("until", parsed.until.toISOString());

  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: authHeader(),
  });
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as ReadonlyArray<AdminAuditEventResponse>;
}

/**
 * POST /admin/audit/purge  body: { dryRun: true, olderThanDays: <n> }
 *
 * The dry-run mode returns `{ matched, wouldDelete }` and never
 * deletes rows; the real mode returns `{ matched, deleted }` and
 * commits a single atomic `deleteMany`.
 */
export async function dryRunPurgeAuditEvents(
  body: Pick<PurgeAuditBody, "olderThanDays">,
): Promise<PurgeAuditDryRunResponse> {
  const parsed = PurgeAuditBodySchema.parse({ ...body, dryRun: true });
  return postPurge({ dryRun: parsed.dryRun, olderThanDays: parsed.olderThanDays }) as Promise<PurgeAuditDryRunResponse>;
}

/**
 * POST /admin/audit/purge  body: { dryRun: false, olderThanDays: <n> }
 *
 * Real (commit-mode) purge. Idempotent: a second call with the same
 * `olderThanDays` returns `{ matched: 0, deleted: 0 }`.
 */
export async function purgeAuditEvents(
  body: Pick<PurgeAuditBody, "olderThanDays">,
): Promise<PurgeAuditRealResponse> {
  const parsed = PurgeAuditBodySchema.parse({ ...body, dryRun: false });
  return postPurge({ dryRun: parsed.dryRun, olderThanDays: parsed.olderThanDays }) as Promise<PurgeAuditRealResponse>;
}

async function postPurge(body: { dryRun: boolean; olderThanDays: number }): Promise<PurgeAuditDryRunResponse | PurgeAuditRealResponse> {
  const res = await fetch(`${apiBase()}/admin/audit/purge`, {
    method: "POST",
    credentials: "include",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as PurgeAuditDryRunResponse | PurgeAuditRealResponse;
}
