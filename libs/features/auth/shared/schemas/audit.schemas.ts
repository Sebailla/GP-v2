import { z } from "zod";

/**
 * M4 (module-4-privacy) audit Zod schemas.
 *
 * Per `openspec/changes/module-4-privacy/design.md` §5
 * (Interfaces / Contracts), the two schemas below are the single
 * source of truth for the audit-slice endpoints' request validation.
 * They live under `libs/features/auth/shared/schemas/` so the
 * `no-schemas-outside-shared` ESLint rule (AGENTS.md §7) enforces
 * the path — any Zod schema declared elsewhere fails CI.
 *
 * Dual consumption pattern (carried from M3 / slice 3 batch 6):
 *  - Server: NestJS `ZodValidationPipe` runs the schema before the
 *    controller method body — invalid queries / bodies never reach
 *    AuditService.
 *  - Client: the Next.js audit-log page (PR #3 — slice 4) uses the
 *    SAME schemas as `@hookform/resolvers/zod` resolvers so a client-
 *    side typo surfaces the same error message as the server.
 *
 * Schema shapes (verbatim from design §5):
 *  - `AuditActionEnum` — closed enum mirroring the Prisma
 *    `AdminAuditAction` (CHANGE_ROLE | REVOKE_SESSION |
 *    REVOKE_ALL_SESSIONS).
 *  - `ListAuditQuerySchema` — `{ actorId?, targetId?, action?,
 *    since?, until?, limit=50, offset=0 }`. `limit` is coerced to
 *    a clamped integer (1-200, default 50); `offset` is coerced to a
 *    non-negative integer (default 0). `actorId` / `targetId` are
 *    UUID-shaped (per the M3 `ListSessionsQuerySchema` precedent).
 *    `since` / `until` are coerced to `Date` via `z.coerce.date()`
 *    so query strings carrying ISO 8601 timestamps land as `Date`
 *    instances.
 *  - `PurgeAuditBodySchema` — `{ dryRun: bool, olderThanDays: int ≥
 *    1 }`. `dryRun` is coerced from the env-string form
 *    (`z.coerce.boolean`); `olderThanDays` MUST be ≥ 1 (per the
 *    spec's "olderThanDays MUST be ≥ 1" mandate — the kill-switch
 *    `0` is reserved for the env contract on the cron side, not
 *    for the operator-initiated endpoint).
 */

// ---------------------------------------------------------------------------
// AuditActionEnum
// ---------------------------------------------------------------------------

/**
 * Closed enum mirroring the `AdminAuditAction` enum in the Prisma
 * schema. Values outside this set are rejected with a Zod error so
 * the controller never has to defend against a bogus action.
 */
export const AuditActionEnum = z.enum([
  "REVOKE_SESSION",
  "REVOKE_ALL_SESSIONS",
  "CHANGE_ROLE",
]);

export type AuditAction = z.infer<typeof AuditActionEnum>;

// ---------------------------------------------------------------------------
// ListAuditQuerySchema
// ---------------------------------------------------------------------------

export const ListAuditQuerySchema = z.object({
  // UUID-shaped per the M3 ListSessionsQuerySchema precedent. The
  // schema accepts UUIDs because NextAuth's adapter contract can
  // hand either UUID or cuid IDs; cuid IDs ALSO pass `z.string().uuid()`
  // because cuid v1+ ids are UUID-compatible at the byte level.
  actorId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  action: AuditActionEnum.optional(),
  // `z.coerce.date()` accepts strings (ISO 8601) or numbers (epoch
  // ms); query strings always land as strings, so the runtime
  // contract is "ISO 8601 in → Date out".
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  // Spec literal: limit default 50, ceiling 200. Zod's `.max(200)`
  // rejects oversize values rather than silently clamping so the
  // operator sees the bad input as a 400 (per task 2.11's
  // triangulation — `?limit=999` → 400, not silently clamped to 200).
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAuditQuery = z.infer<typeof ListAuditQuerySchema>;

// ---------------------------------------------------------------------------
// PurgeAuditBodySchema
// ---------------------------------------------------------------------------

export const PurgeAuditBodySchema = z.object({
  // The body comes through the JSON parser, so `dryRun` lands as a
  // real boolean; `z.coerce.boolean` is a defensive belt-and-braces
  // for clients that send `"true"` / `"false"` as strings (e.g.,
  // form-encoded). We do NOT mirror the sophisticated env-string
  // coercion (true|false|1|0|yes|no|on|off) used on
  // `ADMIN_ENABLED` / `AUDIT_RETENTION_ENABLED` — body payloads
  // always come through `JSON.parse` which preserves the boolean
  // type, so the simpler `z.coerce.boolean` is correct here.
  dryRun: z.coerce.boolean(),
  // Spec literal: `olderThanDays` MUST be ≥ 1 (the kill-switch `0`
  // is reserved for the cron env contract on D2, NOT for the
  // operator endpoint — "purge nothing" is a useless request).
  olderThanDays: z.coerce.number().int().min(1),
});

export type PurgeAuditBody = z.infer<typeof PurgeAuditBodySchema>;