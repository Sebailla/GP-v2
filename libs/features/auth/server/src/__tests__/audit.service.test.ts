import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for the extracted audit-event insert primitive
 * (module-3-superadmin — task 2.5 REFACTOR follow-up).
 *
 * The audit row write was inlined in three places prior to task 2.5:
 *   - `RbacService.changeRole` (transactional, with `tx.adminAuditEvent.create`)
 *   - `SessionService.revoke` (non-transactional, top-level prisma)
 *   - `SessionService.revokeAll` (non-transactional, top-level prisma)
 *
 * `insertAuditEvent(client, input)` is the single primitive now. The
 * function must:
 *   1. Translate `input.action` (TS-only string-literal union) into
 *      the Prisma `AdminAuditAction` enum value when calling
 *      `adminAuditEvent.create`.
 *   2. Project `input.metadata` (Readonly<Record>) into the plain
 *      `Record` Prisma wants for the JSON column.
 *   3. Forward `ipAddress` + `userAgent` (nullable strings) verbatim
 *      — the column is `String? @db.VarChar(45)` / `String? @db.VarChar(512)`
 *      so nulls are first-class.
 *   4. Accept EITHER a top-level prisma client OR an interactive
 *      `$transaction(tx => ...)` tx (the `tx.adminAuditEvent.create`
 *      delegate shape exists on both). The function narrows the
 *      `client` parameter to `Pick<PrismaClient, "adminAuditEvent">`
 *      to avoid entangling with the rest of PrismaClient's surface.
 *   5. Return the inserted row (id + metadata etc.) so callers can
 *      chain `id` reads if needed.
 *
 * The test mocks `client.adminAuditEvent.create` directly and asserts
 * on the captured argument, matching the rbac admin test pattern.
 */

import type { AdminAuditAction, AuditEventInput } from "../audit.service.js";

interface AuditClient {
  adminAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
}

function makeAuditClient(): AuditClient {
  return {
    adminAuditEvent: {
      create: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("insertAuditEvent (audit.service.ts — task 2.5 REFACTOR)", () => {
  it("inserts a CHANGE_ROLE row with metadata { from, to } and the supplied actorId", async () => {
    const { insertAuditEvent } = await import("../audit.service.js");
    const client = makeAuditClient();
    vi.mocked(client.adminAuditEvent.create).mockResolvedValue({
      id: "audit-1",
      actorId: "admin-1",
      targetId: "u1",
      action: "CHANGE_ROLE",
      createdAt: new Date(),
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: null,
      userAgent: null,
    } as never);

    const input: AuditEventInput = {
      actorId: "admin-1",
      targetId: "u1",
      action: "CHANGE_ROLE" satisfies AdminAuditAction,
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: null,
      userAgent: null,
    };

    await insertAuditEvent(client, input);

    expect(client.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const arg = (vi.mocked(client.adminAuditEvent.create).mock.calls[0] as unknown as [
      { data: AuditEventInput },
    ])[0];
    expect(arg.data.actorId).toBe("admin-1");
    expect(arg.data.targetId).toBe("u1");
    expect(arg.data.action).toBe("CHANGE_ROLE");
    expect(arg.data.metadata).toEqual({ from: "USER", to: "ADMIN" });
    expect(arg.data.ipAddress).toBeNull();
    expect(arg.data.userAgent).toBeNull();
  });

  it("inserts a REVOKE_SESSION row with metadata { targetUserId } and forwards IP + UA", async () => {
    const { insertAuditEvent } = await import("../audit.service.js");
    const client = makeAuditClient();
    vi.mocked(client.adminAuditEvent.create).mockResolvedValue({
      id: "audit-2",
      actorId: "admin-1",
      targetId: "session-1",
      action: "REVOKE_SESSION",
      createdAt: new Date(),
      metadata: { targetUserId: "u-target" },
      ipAddress: "203.0.113.5",
      userAgent: "Mozilla/5.0 AdminUA",
    } as never);

    const input: AuditEventInput = {
      actorId: "admin-1",
      targetId: "session-1",
      action: "REVOKE_SESSION",
      metadata: { targetUserId: "u-target" },
      ipAddress: "203.0.113.5",
      userAgent: "Mozilla/5.0 AdminUA",
    };

    await insertAuditEvent(client, input);

    const arg = (vi.mocked(client.adminAuditEvent.create).mock.calls[0] as unknown as [
      { data: AuditEventInput },
    ])[0];
    expect(arg.data.action).toBe("REVOKE_SESSION");
    expect(arg.data.metadata).toEqual({ targetUserId: "u-target" });
    // F4 fix (4R-driven correction): the audit row stores the
    // HMAC-SHA256 hash of the IP, NOT the raw IP.
    const { hashIpForAudit } = await import("../audit.service.js");
    expect(arg.data.ipAddress).toBe(hashIpForAudit("203.0.113.5"));
    expect(arg.data.userAgent).toBe("Mozilla/5.0 AdminUA");
  });

  it("inserts a REVOKE_ALL_SESSIONS row with metadata { count }", async () => {
    const { insertAuditEvent } = await import("../audit.service.js");
    const client = makeAuditClient();
    vi.mocked(client.adminAuditEvent.create).mockResolvedValue({} as never);

    const input: AuditEventInput = {
      actorId: "admin-1",
      targetId: "u-target",
      action: "REVOKE_ALL_SESSIONS",
      metadata: { count: 3 },
      ipAddress: null,
      userAgent: null,
    };

    await insertAuditEvent(client, input);

    const arg = (vi.mocked(client.adminAuditEvent.create).mock.calls[0] as unknown as [
      { data: AuditEventInput },
    ])[0];
    expect(arg.data.action).toBe("REVOKE_ALL_SESSIONS");
    expect(arg.data.metadata).toEqual({ count: 3 });
  });

  it("returns the inserted row (so callers can chain id reads)", async () => {
    const { insertAuditEvent } = await import("../audit.service.js");
    const client = makeAuditClient();
    const inserted = {
      id: "audit-99",
      actorId: "admin-1",
      targetId: "u1",
      action: "CHANGE_ROLE",
      createdAt: new Date(),
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: null,
      userAgent: null,
    };
    vi.mocked(client.adminAuditEvent.create).mockResolvedValue(inserted as never);

    const result = await insertAuditEvent(client, {
      actorId: "admin-1",
      targetId: "u1",
      action: "CHANGE_ROLE",
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: null,
      userAgent: null,
    });

    expect(result).toEqual(inserted);
  });

  it("accepts an interactive-transaction client (`tx.adminAuditEvent.create`) — RbacService path", async () => {
    const { insertAuditEvent } = await import("../audit.service.js");
    // Simulating the shape of a `tx` — same `adminAuditEvent.create`
    // delegate as the top-level prisma client. The function must NOT
    // make assumptions about WHICH surface (top-level vs. tx) it
    // received — it only calls `client.adminAuditEvent.create`.
    const txClient = makeAuditClient();
    vi.mocked(txClient.adminAuditEvent.create).mockResolvedValue({} as never);

    await insertAuditEvent(txClient, {
      actorId: "admin-1",
      targetId: "u1",
      action: "CHANGE_ROLE",
      metadata: { from: "USER", to: "ADMIN" },
      ipAddress: null,
      userAgent: null,
    });

    expect(txClient.adminAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("supports any metadata shape (closed Record — JSON-compatible)", async () => {
    const { insertAuditEvent } = await import("../audit.service.js");
    const client = makeAuditClient();
    vi.mocked(client.adminAuditEvent.create).mockResolvedValue({} as never);

    const input: AuditEventInput = {
      actorId: "admin-1",
      targetId: "u1",
      action: "CHANGE_ROLE",
      metadata: { from: "ADMIN", to: "USER", note: "operator downgraded themselves" },
      ipAddress: null,
      userAgent: null,
    };

    await insertAuditEvent(client, input);

    const arg = (vi.mocked(client.adminAuditEvent.create).mock.calls[0] as unknown as [
      { data: AuditEventInput },
    ])[0];
    expect(arg.data.metadata).toEqual({
      from: "ADMIN",
      to: "USER",
      note: "operator downgraded themselves",
    });
  });

  // F4 fix (4R-driven correction): IP is HMAC-SHA256 hashed with
  // env.JWT_SECRET before persistence. The column stores the digest,
  // NOT the raw IP, mitigating PII risk on the audit trail.
  describe("F4 — IP HMAC hashing", () => {
    it("hashes ipAddress before insert (HMAC-SHA256 with JWT_SECRET)", async () => {
      const { insertAuditEvent, hashIpForAudit } = await import("../audit.service.js");
      const client = makeAuditClient();
      vi.mocked(client.adminAuditEvent.create).mockResolvedValue({} as never);

      const rawIp = "192.168.1.1";
      const expectedHash = hashIpForAudit(rawIp);
      // Sanity: the digest is NOT the raw IP (the column gets the
      // hashed value, not the PII).
      expect(expectedHash).not.toBe(rawIp);
      // Determinism: re-derive from the same IP + same secret → same hash.
      expect(hashIpForAudit(rawIp)).toBe(expectedHash);

      await insertAuditEvent(client, {
        actorId: "admin-1",
        targetId: "u1",
        action: "REVOKE_SESSION",
        metadata: { targetUserId: "u-target" },
        ipAddress: rawIp,
        userAgent: "ua",
      });

      const arg = (vi.mocked(client.adminAuditEvent.create).mock.calls[0] as unknown as [
        { data: { ipAddress: string | null } },
      ])[0];
      expect(arg.data.ipAddress).toBe(expectedHash);
      expect(arg.data.ipAddress).not.toBe(rawIp);
    });

    it("preserves null ipAddress (no hashing applied to absence)", async () => {
      const { insertAuditEvent } = await import("../audit.service.js");
      const client = makeAuditClient();
      vi.mocked(client.adminAuditEvent.create).mockResolvedValue({} as never);

      await insertAuditEvent(client, {
        actorId: "admin-1",
        targetId: "u1",
        action: "CHANGE_ROLE",
        metadata: { from: "USER", to: "ADMIN" },
        ipAddress: null,
        userAgent: null,
      });

      const arg = (vi.mocked(client.adminAuditEvent.create).mock.calls[0] as unknown as [
        { data: { ipAddress: string | null } },
      ])[0];
      expect(arg.data.ipAddress).toBeNull();
    });
  });
});
