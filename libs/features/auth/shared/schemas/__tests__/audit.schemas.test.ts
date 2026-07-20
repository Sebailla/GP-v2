import { describe, it, expect } from "vitest";

/**
 * TDD contract for `audit.schemas.ts` (M4 task 2.1 RED → 2.2 GREEN).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §5 the audit-slice
 * exposes two Zod schemas:
 *
 *   1. `ListAuditQuerySchema` — query-string parsing for
 *      `GET /admin/audit`. All 7 fields are optional; `limit` is
 *      coerced to a clamped integer (1-200, default 50) and `offset`
 *      to a non-negative integer (default 0). Action is the closed
 *      enum `REVOKE_SESSION | REVOKE_ALL_SESSIONS | CHANGE_ROLE`.
 *      IDs are UUIDs. Dates are coerced via `z.coerce.date()` so a
 *      query string carrying `since=2026-01-01T00:00:00Z` lands as a
 *      `Date` instance in the service.
 *
 *   2. `PurgeAuditBodySchema` — body parsing for
 *      `POST /admin/audit/purge`. `dryRun` is a boolean coerced
 *      from the env-string form; `olderThanDays` is a non-negative
 *      integer ≥ 1 (per the spec's "olderThanDays MUST be ≥ 1"
 *      mandate).
 *
 * The boundary tests below pin the validation contract:
 *   - happy: full payload validates
 *   - coercion: string inputs land as the right types
 *   - defaults: missing fields take the spec-literal defaults
 *   - rejection: out-of-range limits, missing required body fields,
 *     out-of-enum action values all fail the parse.
 *
 * RED state (pre-2.2 GREEN): `audit.schemas.ts` does NOT exist yet.
 * Every dynamic import throws ERR_MODULE_NOT_FOUND; every test fails
 * for the expected "feature missing" reason.
 *
 * The test uses dynamic imports inside each `it` to match the
 * pattern in `admin.schemas.test.ts` (slice 3 batch 6). The dynamic
 * form is critical because it lets the file load under vitest's
 * strict ESM resolution — a static top-level import of a missing
 * module throws at module-load time and never even reaches the
 * "RED → GREEN" pivot.
 */

describe("AuditActionEnum (M4 task 2.1 RED)", () => {
  it("accepts the three spec-literal actions", async () => {
    const { AuditActionEnum } = await import("../audit.schemas.js");
    expect(AuditActionEnum.parse("REVOKE_SESSION")).toBe("REVOKE_SESSION");
    expect(AuditActionEnum.parse("REVOKE_ALL_SESSIONS")).toBe("REVOKE_ALL_SESSIONS");
    expect(AuditActionEnum.parse("CHANGE_ROLE")).toBe("CHANGE_ROLE");
  });

  it("rejects actions outside the closed enum", async () => {
    const { AuditActionEnum } = await import("../audit.schemas.js");
    expect(() => AuditActionEnum.parse("GOD")).toThrow();
    expect(() => AuditActionEnum.parse("REVOKE_USER")).toThrow();
    expect(() => AuditActionEnum.parse("")).toThrow();
  });
});

describe("ListAuditQuerySchema (M4 task 2.1 RED, design D3)", () => {
  it("accepts an empty query and applies the spec-literal defaults", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    const result = ListAuditQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
    // No optional filters applied.
    expect(result.actorId).toBeUndefined();
    expect(result.targetId).toBeUndefined();
    expect(result.action).toBeUndefined();
    expect(result.since).toBeUndefined();
    expect(result.until).toBeUndefined();
  });

  it("coerces string query values into typed numbers and dates", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    // Mirrors the runtime contract: the controller receives query
    // strings (`?limit=10&offset=20&since=...&until=...`) and must hand
    // typed values to the service.
    const result = ListAuditQuerySchema.parse({
      limit: "10",
      offset: "20",
      since: "2026-01-01T00:00:00Z",
      until: "2026-12-31T23:59:59Z",
    });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
    expect(result.since).toBeInstanceOf(Date);
    expect(result.until).toBeInstanceOf(Date);
    expect(result.since?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("accepts a valid UUID for actorId and targetId", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    const result = ListAuditQuerySchema.parse({
      actorId: "12345678-1234-1234-8234-123456789012",
      targetId: "87654321-4321-4321-8432-210987654321",
    });
    expect(result.actorId).toBe("12345678-1234-1234-8234-123456789012");
    expect(result.targetId).toBe("87654321-4321-4321-8432-210987654321");
  });

  it("rejects a non-UUID actorId", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    expect(() => ListAuditQuerySchema.parse({ actorId: "not-a-uuid" })).toThrow();
  });

  it("rejects a non-UUID targetId", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    expect(() => ListAuditQuerySchema.parse({ targetId: "123" })).toThrow();
  });

  it("accepts any of the three spec-literal actions", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    for (const action of ["REVOKE_SESSION", "REVOKE_ALL_SESSIONS", "CHANGE_ROLE"] as const) {
      const result = ListAuditQuerySchema.parse({ action });
      expect(result.action).toBe(action);
    }
  });

  it("rejects an action value outside the closed enum", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    // Triangulation: edge case from task 2.11 — `action=GOD` must fail
    // the parse so the controller emits 400 (not a silent pass-through
    // to Prisma's enum column, which would also fail but with a less
    // meaningful error).
    expect(() => ListAuditQuerySchema.parse({ action: "GOD" })).toThrow();
  });

  it("clamps limit to the spec-mandated ceiling of 200", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    // Per spec: "max limit clamped". Zod's `.max(200)` rejects the
    // oversize value — the controller surfaces this as 400 rather than
    // silently clamping (per task 2.11's triangulation). Both fail-
    // closed behaviors are acceptable per the spec; the canonical
    // implementation REJECTS so the operator sees the bad input.
    expect(() => ListAuditQuerySchema.parse({ limit: "999" })).toThrow();
    expect(() => ListAuditQuerySchema.parse({ limit: "500" })).toThrow();
    // Boundary: exactly 200 is the inclusive max.
    const result = ListAuditQuerySchema.parse({ limit: "200" });
    expect(result.limit).toBe(200);
  });

  it("rejects limit below 1", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    expect(() => ListAuditQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() => ListAuditQuerySchema.parse({ limit: "-5" })).toThrow();
  });

  it("rejects negative offset", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    expect(() => ListAuditQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("accepts the full payload (every field populated)", async () => {
    const { ListAuditQuerySchema } = await import("../audit.schemas.js");
    const result = ListAuditQuerySchema.parse({
      actorId: "12345678-1234-1234-8234-123456789012",
      targetId: "87654321-4321-4321-8432-210987654321",
      action: "CHANGE_ROLE",
      since: "2026-01-01T00:00:00Z",
      until: "2026-12-31T23:59:59Z",
      limit: "100",
      offset: "0",
    });
    expect(result.actorId).toBe("12345678-1234-1234-8234-123456789012");
    expect(result.targetId).toBe("87654321-4321-4321-8432-210987654321");
    expect(result.action).toBe("CHANGE_ROLE");
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });
});

describe("PurgeAuditBodySchema (M4 task 2.1 RED, design D4)", () => {
  it("accepts a valid dry-run payload", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    const result = PurgeAuditBodySchema.parse({
      dryRun: true,
      olderThanDays: 90,
    });
    expect(result.dryRun).toBe(true);
    expect(result.olderThanDays).toBe(90);
  });

  it("accepts a valid real-purge payload", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    const result = PurgeAuditBodySchema.parse({
      dryRun: false,
      olderThanDays: 30,
    });
    expect(result.dryRun).toBe(false);
    expect(result.olderThanDays).toBe(30);
  });

  it("coerces string dryRun values to boolean (env-style)", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    // The controller body comes through the JSON parser, so booleans
    // land as `true`/`false` natively. The `z.coerce.boolean` keeps the
    // contract safe if a client (or test) sends `"true"` as a string —
    // the same coercion pattern lives on `ADMIN_ENABLED` in
    // `env.schema.ts`. We deliberately do NOT mirror the more
    // sophisticated env-string coercion (true|false|1|0|yes|no|on|off)
    // — body payloads always come through JSON.parse which preserves
    // the boolean type.
    const truthy = PurgeAuditBodySchema.parse({
      dryRun: "true",
      olderThanDays: 90,
    });
    expect(truthy.dryRun).toBe(true);
  });

  it("coerces numeric olderThanDays from the env-string form", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    const result = PurgeAuditBodySchema.parse({
      dryRun: true,
      olderThanDays: "1",
    });
    expect(result.olderThanDays).toBe(1);
  });

  it("rejects olderThanDays < 1 (spec: olderThanDays MUST be ≥ 1)", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    // Spec literal: "olderThanDays MUST be ≥ 1". The kill-switch
    // (olderThanDays = 0) is reserved for the env contract on the
    // cron side, NOT for the operator-initiated purge endpoint —
    // "purge nothing" is a useless request and would just clutter the
    // operator UX. The endpoint rejects 0 explicitly.
    expect(() =>
      PurgeAuditBodySchema.parse({ dryRun: true, olderThanDays: 0 }),
    ).toThrow();
  });

  it("rejects non-integer olderThanDays", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    expect(() =>
      PurgeAuditBodySchema.parse({ dryRun: true, olderThanDays: 1.5 }),
    ).toThrow();
  });

  it("rejects missing olderThanDays", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    expect(() => PurgeAuditBodySchema.parse({ dryRun: true })).toThrow();
  });

  it("rejects missing dryRun", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    expect(() => PurgeAuditBodySchema.parse({ olderThanDays: 90 })).toThrow();
  });

  it("rejects negative olderThanDays", async () => {
    const { PurgeAuditBodySchema } = await import("../audit.schemas.js");
    expect(() =>
      PurgeAuditBodySchema.parse({ dryRun: true, olderThanDays: -1 }),
    ).toThrow();
  });
});