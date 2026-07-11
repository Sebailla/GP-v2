import type { AuditLog, AuditLogAppend, AuditEntityType } from "../entities/audit-log.entity.js";
import type { UnitOfWorkContext } from "./unit-of-work.js";

/**
 * Domain port for the `AuditLog` table. Every state-mutating service
 * call writes one row to capture the actor + action + entity reference;
 * the only writer from the slice is the `AuditLogRepository`.
 *
 * The actor FK is the only enforced relation (Prisma
 * `onDelete: Restrict`); the polymorphic `entityId` column resolves
 * through `entityType` at read time. The repository owns this
 * disambiguation — the service never queries across `entityType`s.
 */
export interface AuditLogRepository {
  /**
   * Append a new audit log row. The service calls this once per
   * state-mutating action (Transaction create/update/softDelete,
   * Category update/softDelete). The row's `id` and `createdAt` are
   * server-assigned; the repository projects the inserted row and
   * returns it so the service can echo it back in API responses (the
   * spec mandates the audit-log id is included in the response
   * envelope for debugging). The optional `tx` (UnitOfWorkContext)
   * participates the call in a service-level atomic boundary when
   * supplied (R3-002 / R4-005).
   */
  append(input: AuditLogAppend, tx?: UnitOfWorkContext): Promise<AuditLog>;

  /**
   * Read the history of a single row. Returns rows ordered by
   * `createdAt DESC` (most recent first). Pagination lives at the
   * service layer; the repository returns the first `limit` rows
   * verbatim and the caller paginates by passing a `before: Date`
   * cursor on subsequent calls.
   */
  findByEntity(
    entityType: AuditEntityType,
    entityId: string,
    options?: { readonly limit?: number; readonly before?: Date },
  ): Promise<AuditLog[]>;

  /**
   * Read the history of a single actor's actions across all
   * `entityType`s. Same ordering + pagination contract as
   * `findByEntity`. Used by the future audit-log UI (slice 6+).
   */
  listByActor(
    actorId: string,
    options?: { readonly limit?: number; readonly before?: Date },
  ): Promise<AuditLog[]>;
}
