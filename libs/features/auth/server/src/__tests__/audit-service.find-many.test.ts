import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for `AuditService.findMany` (M4 task 2.3 RED → 2.4
 * GREEN). Per `openspec/changes/module-4-privacy/design.md` §2 D3 +
 * `openspec/specs/audit-log-ui/spec.md` "List Audit Events", the
 * service exposes:
 *
 *   findMany({ actorId?, targetId?, action?, since?, until?, limit=50, offset=0 })
 *     → ReadonlyArray<{ id, actorId, targetId, action, createdAt,
 *                       metadata, ipAddress, userAgent }>
 *
 * Dynamic `where` build (D3): only the filters the caller supplies
 * appear in the Prisma `where` clause. Prisma's `undefined` semantics
 * mean a missing filter translates to "no constraint on this column",
 * NOT `WHERE col IS NULL` (the difference matters for forensic
 * queries — `WHERE actorId = NULL` would match no rows).
 *
 * 8 filter combinations are the spec's "8 filter combinations"
 * surface: actorId-only, targetId-only, action-only, since-only,
 * until-only, all-supplied, none-supplied, multi-filter (actorId +
 * action + date-range). The pagination + Zod coercion cases live
 * alongside as their own assertions.
 */

import type { AdminAuditAction } from "../audit.service.js";

interface AuditFindManyClient {
  adminAuditEvent: {
    findMany: ReturnType<typeof vi.fn>;
  };
}

function makeClient(): AuditFindManyClient {
  return {
    adminAuditEvent: {
      findMany: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AuditService.findMany (M4 task 2.3 RED, design D3)", () => {
  it("returns rows ordered DESC by createdAt with default pagination", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    const rows = [
      {
        id: "a1",
        actorId: "admin-1",
        targetId: "u1",
        action: "CHANGE_ROLE",
        createdAt: new Date("2026-01-02T00:00:00Z"),
        metadata: { from: "USER", to: "ADMIN" },
        ipAddress: null,
        userAgent: null,
      },
    ];
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue(rows as never);

    const result = await new AuditService(client as never).findMany({});

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "a1", action: "CHANGE_ROLE" });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number },
    ];
    // Spec literal: DESC by createdAt + default limit=50 + offset=0.
    expect(call[0].orderBy).toEqual({ createdAt: "desc" });
    expect(call[0].take).toBe(50);
    expect(call[0].skip).toBe(0);
  });

  it("passes ONLY supplied filters into the dynamic `where` (no null predicates)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({ actorId: "u-actor-1" });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    // Only `actorId` was supplied — the `where` MUST carry `actorId`,
    // and MUST NOT carry `targetId`, `action`, or any null predicate.
    expect(call[0].where).toEqual({ actorId: "u-actor-1" });
    expect("targetId" in call[0].where).toBe(false);
    expect("action" in call[0].where).toBe(false);
  });

  it("filter combo 1: actorId only", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({ actorId: "u-actor" });

    expect(client.adminAuditEvent.findMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({ actorId: "u-actor" });
  });

  it("filter combo 2: targetId only", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({ targetId: "u-target" });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({ targetId: "u-target" });
  });

  it("filter combo 3: action only", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({ action: "REVOKE_SESSION" });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({ action: "REVOKE_SESSION" });
  });

  it("filter combo 4: since only (date range open on the upper bound)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    const since = new Date("2026-01-01T00:00:00Z");
    await new AuditService(client as never).findMany({ since });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: { createdAt: { gte?: Date; lt?: Date } } },
    ];
    expect(call[0].where.createdAt.gte).toEqual(since);
    expect("lt" in (call[0].where.createdAt as object)).toBe(false);
  });

  it("filter combo 5: until only (date range open on the lower bound)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    const until = new Date("2026-12-31T23:59:59Z");
    await new AuditService(client as never).findMany({ until });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: { createdAt: { gte?: Date; lt?: Date } } },
    ];
    expect(call[0].where.createdAt.lt).toEqual(until);
    expect("gte" in (call[0].where.createdAt as object)).toBe(false);
  });

  it("filter combo 6: all filters supplied (actorId + targetId + action + since + until)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    const since = new Date("2026-01-01T00:00:00Z");
    const until = new Date("2026-12-31T23:59:59Z");
    await new AuditService(client as never).findMany({
      actorId: "u-actor",
      targetId: "u-target",
      action: "CHANGE_ROLE",
      since,
      until,
    });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({
      actorId: "u-actor",
      targetId: "u-target",
      action: "CHANGE_ROLE",
      createdAt: { gte: since, lt: until },
    });
  });

  it("filter combo 7: none supplied (empty where object, no columns)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({});

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({});
  });

  it("filter combo 8: multi-filter (actorId + action + date range)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    const since = new Date("2026-01-01T00:00:00Z");
    const until = new Date("2026-06-30T23:59:59Z");
    await new AuditService(client as never).findMany({
      actorId: "u-actor",
      action: "REVOKE_SESSION",
      since,
      until,
    });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({
      actorId: "u-actor",
      action: "REVOKE_SESSION",
      createdAt: { gte: since, lt: until },
    });
  });

  it("pagination: custom limit + offset are forwarded to Prisma (take + skip)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({ limit: 10, offset: 20 });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { take: number; skip: number },
    ];
    expect(call[0].take).toBe(10);
    expect(call[0].skip).toBe(20);
  });

  it("Zod coercion: numeric limit/offset land as numbers (the schema coerces strings)", async () => {
    // The Zod pipeline delivers numbers — even though the controller
    // passes them through `ZodValidationPipe(ListAuditQuerySchema)`
    // which applies `z.coerce.number()`, the service surface itself
    // expects typed numbers. This test asserts the service contract
    // rather than re-testing the schema.
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([] as never);

    await new AuditService(client as never).findMany({
      limit: 25,
      offset: 5,
    });

    const call = vi.mocked(client.adminAuditEvent.findMany).mock.calls[0] as unknown as [
      { take: number; skip: number },
    ];
    expect(typeof call[0].take).toBe("number");
    expect(typeof call[0].skip).toBe("number");
    expect(call[0].take).toBe(25);
    expect(call[0].skip).toBe(5);
  });

  it("projects the row's id, actorId, targetId, action, createdAt, metadata, ipAddress, userAgent", async () => {
    // Spec literal projection per design §5 + audit-log-ui spec
    // "List Audit Events". The service returns the 8-field shape
    // directly (no controller-side projection — the controller is a
    // pass-through, mirroring the SessionService.list + admin
    // listSessions pattern from PR #1).
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    const row = {
      id: "audit-1",
      actorId: "u-actor",
      targetId: "u-target",
      action: "CHANGE_ROLE" satisfies AdminAuditAction,
      createdAt: new Date("2026-01-02T00:00:00Z"),
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: "deadbeef".repeat(8),
      userAgent: "Mozilla/5.0",
    };
    vi.mocked(client.adminAuditEvent.findMany).mockResolvedValue([row] as never);

    const result = await new AuditService(client as never).findMany({});
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "audit-1",
      actorId: "u-actor",
      targetId: "u-target",
      action: "CHANGE_ROLE",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: "deadbeef".repeat(8),
      userAgent: "Mozilla/5.0",
    });
  });
});