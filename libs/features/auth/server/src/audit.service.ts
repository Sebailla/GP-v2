import { prisma as defaultPrisma } from "@core/database";
import type { Prisma, PrismaClient } from "@core/database";

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
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

/**
 * The canonical @core/database prisma client singleton — re-exported
 * so callers that don't already have a tx (the non-transactional
 * `SessionService.revoke` path) can pass it directly. The default
 * client is the canonical client for production code paths.
 */
export { defaultPrisma };

