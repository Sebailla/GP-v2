import { prisma as defaultPrisma } from "@core/database";
import type { Prisma, PrismaClient } from "@core/database";

import type {
  AuditLog,
  AuditLogAppend,
  AuditEntityType,
} from "../../domain/entities/audit-log.entity.js";
import type { AuditLogRepository } from "../../domain/interfaces/audit-log.repository.js";

/**
 * Prisma adapter for `AuditLogRepository`.
 *
 * The `AuditLog` model has no `@@unique` constraint — every state-mutating
 * service call writes its own row, so duplicates are intentional (one
 * per action). The `(entityType, entityId)` index supports the two read
 * paths (`findByEntity`, `listByActor`); the implicit `actorId` FK
 * index supports the latter.
 *
 * `payload` is a Prisma `Json?` column. The service is responsible for
 * ensuring the payload is JSON-safe (no class instances, no circular
 * refs, no BigInt) before reaching the adapter — same contract as
 * `IdempotencyKey.responsePayload`. The cast below satisfies the
 * `Prisma.InputJsonValue` shape; a runtime validation pass is a
 * service-level concern.
 */
export class PrismaAuditLogRepository implements AuditLogRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async append(input: AuditLogAppend): Promise<AuditLog> {
    const row = await this.prisma.auditLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return projectAuditLog(row);
  }

  async findByEntity(
    entityType: AuditEntityType,
    entityId: string,
    options: { readonly limit?: number; readonly before?: Date } = {},
  ): Promise<AuditLog[]> {
    const limit = options.limit ?? 50;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
        ...(options.before !== undefined
          ? { createdAt: { lt: options.before } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(projectAuditLog);
  }

  async listByActor(
    actorId: string,
    options: { readonly limit?: number; readonly before?: Date } = {},
  ): Promise<AuditLog[]> {
    const limit = options.limit ?? 50;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorId,
        ...(options.before !== undefined
          ? { createdAt: { lt: options.before } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(projectAuditLog);
  }
}

function projectAuditLog(row: {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  payload: unknown;
  createdAt: Date;
}): AuditLog {
  return {
    id: row.id,
    entityType: row.entityType as AuditEntityType,
    entityId: row.entityId,
    action: row.action as AuditLog["action"],
    actorId: row.actorId,
    payload: row.payload,
    createdAt: row.createdAt,
  };
}