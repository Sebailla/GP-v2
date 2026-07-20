import { createHmac } from "node:crypto";

import { prisma as defaultPrisma } from "@core/database";
import type { Prisma, PrismaClient } from "@core/database";
import { env } from "@core/config";

/**
 * `insertAuditEvent` — the single audit-row insertion primitive for
 * the auth slice's admin operations (module-3-superadmin — task 2.5
 * REFACTOR).
 *
 * Prior to this refactor, two call sites inlined the same
 * `tx.adminAuditEvent.create({ data: { ... } })` shape:
 *
 *   1. `RbacService.changeRole` — inside a `prisma.$transaction`,
 *      paired with the `user.update` write so a partial failure
 *      rolls back both writes (audit drift is unacceptable).
 *   2. `SessionService.revoke` — non-transactional (the session row
 *      has already been deleted by the time the audit row is
 *      inserted; the audit captures the action that just happened).
 *   3. `SessionService.revokeAll` — non-transactional, same as #2.
 *
 * This module extracts the audit-row construction into one place so
 * the action enum, the metadata JSON, and the IP/UA capture stay
 * consistent across every caller. The function signature accepts
 * either a `tx` (interactive-transaction client) or a top-level
 * `prisma` client — the caller chooses based on whether it pairs
 * the insert with a co-write in the same transaction.
 *
 * The "pure" part of the function is the `metadata` shape mapping
 * (`Prisma.InputJsonValue` is the source-of-truth type, not
 * `Readonly<Record>` — Prisma's JSON column accepts scalars +
 * arrays + plain objects, NOT arbitrary unknown values). The
 * side-effect (the actual `create`) is wrapped in a single
 * delegate call.
 *
 * Pino `[ip]` redaction (per `pattern/pino-bracket-notation-redaction`)
 * is applied at the LOG layer, not here. The IP is stored as
 * captured by the controller (`req.ip`, truncated to 45 chars at the
 * controller boundary per design D3).
 */

/**
 * The action enumeration — closed string-literal union mirroring the
 * Prisma `AdminAuditAction` enum in
 * `libs/core/database/prisma/schema.prisma` (CHANGE_ROLE |
 * REVOKE_SESSION | REVOKE_ALL_SESSIONS). Declared here so the
 * auth slice can stay self-contained without importing the
 * generated client (the boundary rule is `domain ← infrastructure`,
 * never the reverse — the enum is a domain concept of "what kind
 * of admin action just happened").
 */
export type AdminAuditAction = "CHANGE_ROLE" | "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS";

/**
 * The audit-row input shape — what callers MUST supply. The
 * function fills in `id` (Prisma-generated cuid), `createdAt`
 * (Prisma `default(now())`), and serializes `metadata` to the
 * Prisma `InputJsonValue` shape. `Prisma.InputJsonValue` is the
 * canonical JSON-accepting type from the generated client; callers
 * pass plain object literals and TypeScript accepts them
 * structurally.
 */
export interface AuditEventInput {
  /** id of the admin who initiated the action. */
  readonly actorId: string;
  /** id of the entity affected (a userId for CHANGE_ROLE, a sessionId for REVOKE_*). */
  readonly targetId: string;
  /** the closed enum member — CHANGE_ROLE | REVOKE_SESSION | REVOKE_ALL_SESSIONS. */
  readonly action: AdminAuditAction;
  /** arbitrary JSON-compatible metadata (e.g., `{ from, to }` for CHANGE_ROLE; `{ count }` for REVOKE_ALL_SESSIONS). */
  readonly metadata: Prisma.InputJsonValue;
  /** controller-captured `req.ip` (≤45 chars per schema), or null when unavailable. */
  readonly ipAddress: string | null;
  /** controller-captured `req.headers['user-agent']` (≤512 chars per schema), or null when unavailable. */
  readonly userAgent: string | null;
}

/**
 * Transactional client shape. The function accepts the interactive
 * `$transaction(tx => ...)` client OR a top-level `prisma` client —
 * the same `adminAuditEvent.create` delegate exists on both. We
 * narrow with `Pick` so the function doesn't pull in the full
 * PrismaClient type (which would entangle the slice with the rest
 * of the auth module's ports).
 */
export type AuditClient = Pick<PrismaClient, "adminAuditEvent">;

/**
 * Insert an `AdminAuditEvent` row. The function is the single
 * insertion primitive for every admin op; callers MUST go through it
 * instead of inlining `prisma.adminAuditEvent.create`. The
 * "purity" is in the input-shape mapping (the function is a
 * one-delegate wrapper that enforces the column set + the action
 * enum).
 *
 * F4 fix (4R-driven correction): IP is hashed with HMAC-SHA256 before
 * persistence to mitigate PII risk; the raw IP is captured only in
 * logs (already redacted via pino `[ip]` redact path). The same IP
 * + same secret always produces the same hash, so forensic queries
 * can re-derive by re-hashing the suspected IP with the same secret.
 * The secret is `env.JWT_SECRET` — reused, NOT a new env var — to
 * keep the env contract surface small. A dedicated `AUDIT_IP_HMAC_SECRET`
 * would be marginally safer (key separation) but is out of scope for
 * the reference repo; the JWT secret is already 32+ chars and
 * operator-only.
 *
 * @param client Either a `$transaction(tx => ...)` tx or the top-
 *   level `@core/database` prisma client. Both expose the
 *   `adminAuditEvent.create` delegate.
 * @param input The audit-row payload (see `AuditEventInput`).
 *
 * Returns the inserted row, mirroring Prisma's `create` return
 * shape (so callers can chain `.id` reads if they need to, e.g.,
 * to correlate the audit row id with a downstream dispatch).
 *
 * The return type is annotated explicitly as `Promise<unknown>` to
 * keep the function portable across the @core/database consumer
 * typechain (the inferred type from `adminAuditEvent.create` pulls
 * in Prisma's internal `JsonValue` which fails downstream
 * typecheck in apps/api). Callers that need the typed row should
 * import the `AdminAuditEvent` model type directly from
 * `@core/database`.
 */
export async function insertAuditEvent(
  client: AuditClient | PrismaClient,
  input: AuditEventInput,
): Promise<unknown> {
  return client.adminAuditEvent.create({
    data: {
      actorId: input.actorId,
      targetId: input.targetId,
      action: input.action,
      metadata: input.metadata,
      ipAddress: hashIpForAudit(input.ipAddress),
      userAgent: input.userAgent,
    },
  });
}

/**
 * HMAC-SHA256 the supplied IP for forensic-friendly PII protection.
 *
 * - `null` (no IP captured) → returns `null` (column is nullable).
 * - Otherwise returns the hex digest of `HMAC-SHA256(secret, ip)`.
 *
 * Determinism is the property that makes forensic queries work:
 * "show me every audit row for IP 1.2.3.4" becomes
 * `WHERE ipAddress = hashIpForAudit('1.2.3.4')` — the same secret
 * regenerates the same digest, so the DB column is searchable as
 * if it were the raw IP (without storing it raw).
 *
 * The function is exported separately so the test suite can pin
 * the determinism contract (same input + same secret → same output)
 * without dragging the full insertAuditEvent machinery.
 */
export function hashIpForAudit(ipAddress: string | null): string | null {
  if (ipAddress === null) return null;
  return createHmac("sha256", env.JWT_SECRET).update(ipAddress).digest("hex");
}

/**
 * The canonical @core/database prisma client singleton — re-exported
 * so callers that don't already have a tx (the non-transactional
 * `SessionService.revoke` path) can pass it directly. The default
 * client is the canonical client for production code paths.
 */
export { defaultPrisma };

// ---------------------------------------------------------------------------
// AuditService class (M4 module-4-privacy — task 2.4 GREEN + 2.6 GREEN)
//
// Per `openspec/changes/module-4-privacy/design.md` §2 D3 + D4 +
// `openspec/specs/audit-log-ui/spec.md` the audit-slice exposes three
// read/write primitives beyond the M3 insertAuditEvent:
//   - `findMany` (D3) — filtered, paginated query of `AdminAuditEvent`
//     rows sorted DESC by `createdAt`. The `where` clause is built
//     dynamically — only filters the caller supplies are added
//     (Prisma's `undefined` semantics translate to "no constraint on
//     this column", NOT `WHERE col IS NULL`).
//   - `countOlderThan(days)` (D4) — count the rows where
//     `createdAt < now - days * 86_400_000`. Used by the dry-run
//     path of `POST /admin/audit/purge` and by the audit-retention
//     cron. Idempotent — running twice yields the same count.
//   - `purgeOlderThan(days)` (D4) — DELETE the rows where
//     `createdAt < now - days * 86_400_000` atomically (single
//     `deleteMany` call regardless of count). Idempotent — the
//     second call sees zero matching rows and returns 0.
//
// The class takes a `PrismaClient`-shaped dependency (NOT the
// default singleton) so tests inject a `vi.fn()`-backed mock. The
// default-argument fallback wires the production `@core/database`
// singleton — mirroring the `SessionService` constructor pattern.
// ---------------------------------------------------------------------------

/**
 * The subset of PrismaClient the audit read/write primitives need.
 * `findMany` (adminAuditEvent), `count` (adminAuditEvent), and
 * `deleteMany` (adminAuditEvent) — a single model delegate. The
 * `Pick` keeps the surface narrow so adapters / test doubles don't
 * have to stub the full client.
 */
export type AuditServiceClient = Pick<
  PrismaClient,
  "adminAuditEvent"
>;

/**
 * Find-many filter shape. Mirrors `ListAuditQuerySchema` (the Zod
 * boundary parser) so the controller can pass the validated query
 * straight through. All filters optional; pagination lands as
 * `take` / `skip` on the Prisma call.
 *
 * The dates are `Date` instances (the Zod schema coerces ISO 8601
 * strings via `z.coerce.date()`). The service does NOT re-validate
 * — the controller's ZodValidationPipe is the single source of
 * truth per AGENTS.md §8.
 */
export interface FindManyFilters {
  readonly actorId?: string | undefined;
  readonly targetId?: string | undefined;
  readonly action?: AdminAuditAction | undefined;
  readonly since?: Date | undefined;
  readonly until?: Date | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/**
 * Spec-literal projection returned by `findMany` and forwarded
 * verbatim by the controller (per audit-log-ui spec "List Audit
 * Events"). `metadata` is the Prisma `JsonValue` shape — the
 * schema's JSON column accepts any JSON-compatible value.
 */
export interface AuditEventRow {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: AdminAuditAction;
  readonly createdAt: Date;
  readonly metadata: Prisma.InputJsonValue;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * `AuditService` — the read/write primitive layer for the
 * `AdminAuditEvent` table (M4 module-4-privacy). Pattern mirrors
 * `SessionService`: a class that takes a Prisma-shaped dependency
 * in its constructor (defaulting to the workspace singleton), with
 * `findMany`, `countOlderThan`, `purgeOlderThan` methods exposed
 * for the AdminController + the audit-retention cron (task 2.10).
 */
export class AuditService {
  private readonly prisma: AuditServiceClient;

  constructor(client?: AuditServiceClient | PrismaClient) {
    // Default to the canonical @core/database singleton when no
    // client is injected — mirrors the SessionService pattern.
    this.prisma = client ?? defaultPrisma;
  }

  /**
   * Read audit events with dynamic filters (D3). The Prisma `where`
   * is built ONLY from filters the caller supplied — missing filters
   * translate to `undefined` (which Prisma treats as "no constraint
   * on this column", NOT `WHERE col IS NULL`). Pagination lands as
   * `take` / `skip`.
   *
   * Sort order is fixed at `createdAt DESC` per the audit-log-ui
   * spec's "Default sorted DESC" scenario — there's no `orderBy`
   * parameter because the spec mandates a single ordering.
   *
   * The `date range` filter is folded into a `createdAt: { gte,
   * lt }` sub-clause when both bounds are present; only `gte` or
   * only `lt` is added otherwise. This keeps the `where` shape
   * normalized and avoids a combinatorial explosion of conditional
   * branches.
   */
  async findMany(filters: FindManyFilters): Promise<ReadonlyArray<AuditEventRow>> {
    const where: Record<string, unknown> = {};
    if (filters.actorId !== undefined) where["actorId"] = filters.actorId;
    if (filters.targetId !== undefined) where["targetId"] = filters.targetId;
    if (filters.action !== undefined) where["action"] = filters.action;

    // Fold date-range filters into a single `createdAt: { ... }` sub-
    // clause. `since` is inclusive (`gte`); `until` is exclusive
    // (`lt`) — exclusive upper bound matches the spec's "rows
    // spanning dates" semantics where a row at exactly `until` is
    // considered out of range (the operator usually wants a date
    // range, not an instant).
    if (filters.since !== undefined || filters.until !== undefined) {
      const createdAt: { gte?: Date; lt?: Date } = {};
      if (filters.since !== undefined) createdAt.gte = filters.since;
      if (filters.until !== undefined) createdAt.lt = filters.until;
      where["createdAt"] = createdAt;
    }

    const rows = await this.prisma.adminAuditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    });
    return rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      targetId: row.targetId,
      action: row.action as AdminAuditAction,
      createdAt: row.createdAt,
      metadata: row.metadata as Prisma.InputJsonValue,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    }));
  }

  /**
   * Count the rows older than `days` (D4). Used by the dry-run path
   * of `POST /admin/audit/purge` and by the audit-retention cron.
   *
   * The cut-off is exclusive (`lt`): rows where `createdAt < now -
   * days * 86_400_000` are matched. The 86_400_000 magic number is
   * the canonical `MS_PER_DAY` (24 * 60 * 60 * 1000) — extracted
   * to a named constant below for clarity.
   *
   * Returns 0 when no rows match (idempotent — running the count
   * twice yields the same number).
   */
  async countOlderThan(days: number): Promise<number> {
    const cutoff = olderThanCutoff(days);
    return this.prisma.adminAuditEvent.count({
      where: { createdAt: { lt: cutoff } },
    });
  }

  /**
   * Delete every row older than `days` atomically (D4). The single
   * `deleteMany` call is the atomicity boundary — Postgres' MVCC
   * guarantees readers see all-or-none of the deletion, satisfying
   * the audit-log-ui spec's "Atomic deletion" scenario.
   *
   * Idempotent on a second call: after the first call the matched
   * count is zero and `deleteMany` returns `{ count: 0 }`. The
   * caller's `deleted` field lands at 0 — no error, no event.
   *
   * Returns the count of deleted rows. The retention cron logs
   * `purged N rows` when `N > 0`; the controller surfaces `{ matched,
   * deleted }` to the operator.
   */
  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = olderThanCutoff(days);
    const result = await this.prisma.adminAuditEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}

/**
 * Cut-off helper — computes `now - days * MS_PER_DAY`. Centralized
 * so `countOlderThan` and `purgeOlderThan` agree on the boundary
 * (a divergent cut-off would produce a count/delete mismatch on the
 * dry-run → real-purge path).
 */
const MS_PER_DAY = 86_400_000;

function olderThanCutoff(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

