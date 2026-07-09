/**
 * Domain entity: `AuditLog`.
 *
 * Mirrors the `AuditLog` model in
 * `libs/core/database/prisma/schema.prisma`. Every state-mutating
 * service call (Transaction `create` / `update` / `softDelete`,
 * Category `update` / `softDelete`) writes one row to capture the
 * actor, the action, and the affected entity.
 *
 * **Polymorphic entity reference.** `entityType` + `entityId` identify
 * the affected row. We intentionally do NOT use a Prisma FK for
 * `entityId` — the same column holds Transaction or Category IDs, and
 * the only enforced relation is the actor (`actorId → User.id`,
 * `onDelete: Restrict` so an actor delete can't strand audit history).
 * The `(entityType, entityId)` index supports the two read paths:
 *   - `findByEntity(entityType, entityId)` — "history of this row"
 *   - `listByActor(actorId)` — "what did this user do?"
 *
 * `payload` is the JSON snapshot of the action's input + outcome. The
 * service is responsible for ensuring the payload is JSON-safe (no
 * class instances, no circular refs, no BigInt) — same contract as
 * `IdempotencyKey.responsePayload`.
 *
 * The `AuditLogRepository` is the only writer of this table from the
 * slice; consumers (controllers, BDD scenarios) read it via the
 * repository's `findByEntity` + `listByActor` methods.
 */
export type AuditEntityType = "Transaction" | "Category";

export type AuditAction = "create" | "update" | "softDelete";

/**
 * Read shape. `payload` is the opaque JSON-serialized context the
 * service wrote; consumers should treat it as untyped (treat as
 * `unknown` and narrow per use case).
 */
export interface AuditLog {
  readonly id: string;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actorId: string;
  readonly payload: unknown;
  readonly createdAt: Date;
}

/**
 * Insert input for `AuditLogRepository.append`. The service builds
 * this shape from the action's context (entityType, entityId, actorId,
 * action, payload). The repository projects it onto the Prisma
 * `create` call.
 */
export interface AuditLogAppend {
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actorId: string;
  readonly payload: unknown;
}
