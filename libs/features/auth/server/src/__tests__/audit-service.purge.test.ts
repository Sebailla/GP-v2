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
 *   5. F4 fix (4R-driven correction): the cutoff is computed
 *      against the DB clock via `Prisma.raw("now() - interval
 *      '<days> days'")`, NOT against the API server clock via
 *      `Date.now()`. If the API server clock drifts from the DB
 *      clock, the previous implementation's `createdAt < now -
 *      days * 86_400_000` evaluates against two different
 *      `now`s — the boundary is ambiguous. The DB-clock fix
 *      delegates the time arithmetic to Postgres so the
 *      count/purge and the cutoff are computed against the same
 *      clock.
 */

interface AuditPurgeClient {
  adminAuditEvent: {
    count: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  // F4 fix: countOlderThan uses $queryRaw (typed SELECT COUNT(*)
  // against the DB clock); purgeOlderThan uses $executeRaw (typed
  // DELETE against the DB clock). Both replace the typed
  // `adminAuditEvent.count` / `deleteMany` calls — Prisma 7's
  // typed `where.createdAt.lt` doesn't accept `Prisma.raw`, so
  // we drop into the raw surface for the cutoff-bearing queries.
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
}

function makeClient(): AuditPurgeClient {
  return {
    adminAuditEvent: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AuditService.countOlderThan (M4 task 2.5 RED, design D4)", () => {
  it("returns the matched count from Prisma (not a hardcoded constant)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    // F4 fix: the count now flows through $queryRaw (SELECT COUNT(*)
    // against the DB clock). The mock returns the canonical Postgres
    // `{ count: bigint }` shape.
    vi.mocked(client.$queryRaw).mockResolvedValue([{ count: 42n }] as never);

    const result = await new AuditService(client as never).countOlderThan(90);

    // Real production data: 42 rows older than 90 days. The result
    // comes from Postgres' COUNT(*) — the test asserts the function
    // forwards the count verbatim (no fake-it hardcoded return).
    expect(result).toBe(42);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("computes the cutoff against the DB clock via $queryRaw (F4 fix)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$queryRaw).mockResolvedValue([{ count: 0n }] as never);

    await new AuditService(client as never).countOlderThan(30);

    // F4 fix: the cutoff is delegated to Postgres via $queryRaw —
    // `now() - (${days} || ' days')::interval` — NOT a JS `Date`
    // computed against the API server clock. The tagged-template
    // shape means the call lands on the mock as
    // `(TemplateStringsArray, ...values)` — the template's raw
    // fragments carry the SQL string.
    const call = vi.mocked(client.$queryRaw).mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    // The first argument is the TemplateStringsArray; its `.raw`
    // (or joined) contains the SQL skeleton with `${}` placeholders.
    const tpl = call[0];
    const sqlText = tpl.raw ? tpl.raw.join(" ") : tpl.join(" ");
    expect(sqlText).toContain("COUNT(*)");
    expect(sqlText).toContain("now()");
    expect(sqlText).toContain("interval");
    // The `days` parameter is bound positionally as `${days}` (not
    // interpolated into the SQL string) — injection-safe.
    expect(call.slice(1)).toEqual([30]);
  });

  it("returns 0 when no rows match (idempotent baseline)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$queryRaw).mockResolvedValue([{ count: 0n }] as never);

    const result = await new AuditService(client as never).countOlderThan(90);
    expect(result).toBe(0);
  });
});

describe("AuditService.purgeOlderThan (M4 task 2.5 RED, design D4)", () => {
  it("deletes matching rows via a single $executeRaw DELETE call (atomicity)", async () => {
    // The atomicity property: a SINGLE DELETE statement, regardless of
    // how many rows match. The test would catch a row-by-row loop
    // implementation immediately ($executeRaw.calls.length > 1).
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$executeRaw).mockResolvedValue(7 as never);

    const deleted = await new AuditService(client as never).purgeOlderThan(90);

    expect(deleted).toBe(7);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("computes the cutoff against the DB clock via $executeRaw (F4 fix)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$executeRaw).mockResolvedValue(0 as never);

    await new AuditService(client as never).purgeOlderThan(30);

    // F4 fix: same contract as countOlderThan — the DELETE runs
    // against the DB clock. The cutoff is delegated to Postgres.
    const call = vi.mocked(client.$executeRaw).mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const tpl = call[0];
    const sqlText = tpl.raw ? tpl.raw.join(" ") : tpl.join(" ");
    expect(typeof sqlText).toBe("string");
    expect(sqlText).toContain("DELETE");
    expect(sqlText).toContain("now()");
    expect(sqlText).toContain("interval");
    expect(call.slice(1)).toEqual([30]);
  });

  it("idempotent: a second purgeOlderThan with the same days returns 0 deleted", async () => {
    // The audit-log-ui spec's "Idempotent repeat" scenario: the
    // same purge runs again, returns 0, and the rows stay gone.
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$executeRaw)
      .mockResolvedValueOnce(42 as never)
      .mockResolvedValueOnce(0 as never);

    const first = await new AuditService(client as never).purgeOlderThan(90);
    const second = await new AuditService(client as never).purgeOlderThan(90);

    expect(first).toBe(42);
    expect(second).toBe(0);
    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("deletes zero rows when nothing matches (clean cut-off)", async () => {
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$executeRaw).mockResolvedValue(0 as never);

    const deleted = await new AuditService(client as never).purgeOlderThan(1);
    expect(deleted).toBe(0);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("atomicity: a single $executeRaw DELETE call even when many rows match (Postgres MVCC guarantee)", async () => {
    // The atomicity property is what the audit-log-ui spec's
    // "Atomic deletion" scenario pins: "one admin reads while
    // another purges, the reader sees all-or-none". A loop of
    // per-row DELETEs would have N $executeRaw calls — the test
    // catches that pattern by asserting EXACTLY one call even
    // when the matched count is 1_000.
    const { AuditService } = await import("../audit.service.js");
    const client = makeClient();
    vi.mocked(client.$executeRaw).mockResolvedValue(1000 as never);

    const deleted = await new AuditService(client as never).purgeOlderThan(7);

    expect(deleted).toBe(1000);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });
});