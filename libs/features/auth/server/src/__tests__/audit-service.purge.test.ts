import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for `AuditService.countOlderThan` + `purgeOlderThan`
 * (M4 task 2.5 RED → 2.6 GREEN). Per `openspec/changes/module-4-
 * privacy/design.md` §2 D4 + `openspec/specs/audit-log-ui/spec.md`
 * "Purge Audit Events (Real)":
 *
 *   countOlderThan(days)  → number
 *   purgeOlderThan(days)  → number (count of deleted rows)
 *
 * Properties pinned by this contract:
 *   1. `countOlderThan` returns the matched count (a real number
 *      from Prisma, NOT a fake-it hardcoded constant).
 *   2. `purgeOlderThan` deletes matching rows atomically (single
 *      `deleteMany` call regardless of how many rows would match —
 *      the 86_400_000-ms boundary is the cut-off, exclusive `lt`).
 *   3. Idempotent on a second call (the count drops to zero; the
 *      second delete is a no-op).
 *   4. `deleteMany` is invoked exactly ONCE per `purgeOlderThan`
 *      call (no loops, no row-by-row deletes — Postgres MVCC
 *      guarantees the single-call atomicity).
 *   5. The `where` clause is `{ createdAt: { lt: cutoff } }` where
 *      `cutoff = now - days * 86_400_000`.
 */

interface AuditPurgeClient {
  adminAuditEvent: {
    count: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
}

function makeClient(): AuditPurgeClient {
  return {
    adminAuditEvent: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AuditService.countOlderThan (M4 task 2.5 RED, design D4)", () => {
  it("returns the matched count from Prisma (not a hardcoded constant)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.count).mockResolvedValue(42 as never);

    const result = await new AuditService(client as never).countOlderThan(90);

    // Real production data: 42 rows older than 90 days. The result
    // comes from Prisma's `count` — the test asserts the function
    // forwards the count verbatim (no fake-it hardcoded return).
    expect(result).toBe(42);
    expect(client.adminAuditEvent.count).toHaveBeenCalledTimes(1);
  });

  it("passes a `where: { createdAt: { lt: cutoff } }` predicate to Prisma", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.count).mockResolvedValue(0 as never);

    const beforeCall = Date.now();
    await new AuditService(client as never).countOlderThan(30);
    const afterCall = Date.now();

    const call = vi.mocked(client.adminAuditEvent.count).mock.calls[0] as unknown as [
      { where: { createdAt: { lt: Date } } },
    ];
    expect(call[0].where.createdAt.lt).toBeInstanceOf(Date);
    // The cut-off is `now - 30 days`; verify it sits within the
    // expected window. We pin the window because the test runs
    // across an arbitrary `now()` — a hardcoded assertion on the
    // exact cut-off would be flaky.
    const cutoffMs = (call[0].where.createdAt.lt as Date).getTime();
    const expectedWindowStart = beforeCall - 30 * 86_400_000 - 50;
    const expectedWindowEnd = afterCall - 30 * 86_400_000 + 50;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedWindowStart);
    expect(cutoffMs).toBeLessThanOrEqual(expectedWindowEnd);
  });

  it("returns 0 when no rows match (idempotent baseline)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.count).mockResolvedValue(0 as never);

    const result = await new AuditService(client as never).countOlderThan(90);
    expect(result).toBe(0);
  });
});

describe("AuditService.purgeOlderThan (M4 task 2.5 RED, design D4)", () => {
  it("deletes matching rows via a single deleteMany call (atomicity)", async () => {
    // The atomicity property: a SINGLE deleteMany, regardless of how
    // many rows match. The test would catch a row-by-row loop
    // implementation immediately (deleteMany.calls.length > 1).
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.deleteMany).mockResolvedValue({ count: 7 } as never);

    const deleted = await new AuditService(client as never).purgeOlderThan(90);

    expect(deleted).toBe(7);
    expect(client.adminAuditEvent.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("passes a `where: { createdAt: { lt: cutoff } }` predicate to deleteMany", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.deleteMany).mockResolvedValue({ count: 0 } as never);

    const beforeCall = Date.now();
    await new AuditService(client as never).purgeOlderThan(30);
    const afterCall = Date.now();

    const call = vi.mocked(client.adminAuditEvent.deleteMany).mock.calls[0] as unknown as [
      { where: { createdAt: { lt: Date } } },
    ];
    expect(call[0].where.createdAt.lt).toBeInstanceOf(Date);
    const cutoffMs = (call[0].where.createdAt.lt as Date).getTime();
    const expectedWindowStart = beforeCall - 30 * 86_400_000 - 50;
    const expectedWindowEnd = afterCall - 30 * 86_400_000 + 50;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedWindowStart);
    expect(cutoffMs).toBeLessThanOrEqual(expectedWindowEnd);
  });

  it("idempotent: a second purgeOlderThan with the same days returns 0 deleted", async () => {
    // The audit-log-ui spec's "Idempotent repeat" scenario: the
    // same purge runs again, returns `{ matched: 0, deleted: 0 }`,
    // and the rows stay gone. We simulate by having the second
    // `deleteMany` return `{ count: 0 }` (matching reality — the
    // first call wiped the rows).
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.deleteMany)
      .mockResolvedValueOnce({ count: 42 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);

    const first = await new AuditService(client as never).purgeOlderThan(90);
    const second = await new AuditService(client as never).purgeOlderThan(90);

    expect(first).toBe(42);
    expect(second).toBe(0);
    expect(client.adminAuditEvent.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("deletes zero rows when nothing matches (clean cut-off)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.deleteMany).mockResolvedValue({ count: 0 } as never);

    const deleted = await new AuditService(client as never).purgeOlderThan(1);
    expect(deleted).toBe(0);
    expect(client.adminAuditEvent.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("atomicity: a single deleteMany call even when many rows match (Postgres MVCC guarantee)", async () => {
    // The atomicity property is what the audit-log-ui spec's
    // "Atomic deletion" scenario pins: "one admin reads while
    // another purges, the reader sees all-or-none". A row-by-row
    // deleteMany-in-a-loop implementation would have N calls — the
    // test catches that pattern by asserting EXACTLY one call
    // even when the matched count is 1_000.
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.adminAuditEvent.deleteMany).mockResolvedValue({ count: 1000 } as never);

    const deleted = await new AuditService(client as never).purgeOlderThan(7);

    expect(deleted).toBe(1000);
    expect(client.adminAuditEvent.deleteMany).toHaveBeenCalledTimes(1);
  });
});