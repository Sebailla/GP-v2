import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dryRunPurgeAuditEvents,
  listAdminAuditEvents,
  purgeAuditEvents,
} from "../../lib/audit-api";

/**
 * TDD contract for `apps/web/lib/audit-api.ts` — M4 Phase 3 (PR #3,
 * tasks 3.1 + 3.2).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §5 HTTP contract
 * + AGENTS.md §8 single source of truth, the audit-slice wrappers
 * must:
 *  - send `Authorization: Bearer <token>` on every call (M3 JD-1
 *    pattern, same as `apps/web/lib/admin-api.ts`)
 *  - encode URL query params correctly (limit, offset, actorId,
 *    targetId, action, since, until)
 *  - URL-encode UUIDs / ISO date strings so the API receives valid
 *    values
 *
 * Three wrappers under test:
 *  - `listAdminAuditEvents(query)` → GET /admin/audit
 *  - `dryRunPurgeAuditEvents({ olderThanDays })` → POST /admin/audit/purge
 *  - `purgeAuditEvents({ olderThanDays })` → POST /admin/audit/purge
 *
 * The dry-run vs real split is encoded via the `dryRun` boolean in
 * the request body (per design §5 HTTP contract — single endpoint,
 * dual mode).
 */

const TOKEN = "signed-admin-token";
const BASE = "http://localhost:3001";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchOk(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("audit API authorization", () => {
  it("sends Authorization: Bearer header on every wrapper call", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    // Each wrapper expects its own response shape (list returns
    // [], purge variants return matched/wouldDelete or matched/
    // deleted). Build a fresh Response per call so happy-dom does
    // not flag the body as already-consumed.
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.method === "POST"
        ? JSON.stringify({ matched: 1, deleted: 1 })
        : JSON.stringify([]);
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await listAdminAuditEvents();
    await dryRunPurgeAuditEvents({ olderThanDays: 90 });
    await purgeAuditEvents({ olderThanDays: 90 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit]>) {
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    }
  });
});

describe("listAdminAuditEvents — URL param encoding", () => {
  it("encodes limit + offset as query params", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk([]);

    await listAdminAuditEvents({ limit: 25, offset: 50 });

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/admin/audit?");
    expect(calledUrl).toContain("limit=25");
    expect(calledUrl).toContain("offset=50");
  });

  it("encodes filter values (actorId, targetId, action, since, until)", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk([]);

    const actorId = "11111111-1111-4111-8111-111111111111";
    const targetId = "22222222-2222-4222-8222-222222222222";
    await listAdminAuditEvents({
      actorId,
      targetId,
      action: "REVOKE_SESSION",
      since: new Date("2026-01-01T00:00:00.000Z"),
      until: new Date("2026-02-01T00:00:00.000Z"),
      limit: 10,
      offset: 0,
    });

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain(`actorId=${actorId}`);
    expect(calledUrl).toContain(`targetId=${targetId}`);
    expect(calledUrl).toContain("action=REVOKE_SESSION");
    // ISO date strings round-trip through encodeURIComponent
    expect(calledUrl).toContain("since=2026-01-01T00%3A00%3A00.000Z");
    expect(calledUrl).toContain("until=2026-02-01T00%3A00%3A00.000Z");
    expect(calledUrl).toContain("limit=10");
    expect(calledUrl).toContain("offset=0");
  });

  it("uses GET method", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk([]);

    await listAdminAuditEvents();

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("defaults limit to 50 and offset to 0 when omitted", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk([]);

    await listAdminAuditEvents();

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("limit=50");
    expect(calledUrl).toContain("offset=0");
  });
});

describe("dryRunPurgeAuditEvents — POST /admin/audit/purge (dry-run)", () => {
  it("POSTs dryRun:true with olderThanDays in the body", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk({ matched: 42, wouldDelete: 42 });

    const result = await dryRunPurgeAuditEvents({ olderThanDays: 90 });

    expect(result).toEqual({ matched: 42, wouldDelete: 42 });
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/admin/audit/purge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      dryRun: true,
      olderThanDays: 90,
    });
  });
});

describe("purgeAuditEvents — POST /admin/audit/purge (real)", () => {
  it("POSTs dryRun:false with olderThanDays in the body", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk({ matched: 42, deleted: 42 });

    const result = await purgeAuditEvents({ olderThanDays: 90 });

    expect(result).toEqual({ matched: 42, deleted: 42 });
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/admin/audit/purge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      dryRun: false,
      olderThanDays: 90,
    });
  });
});

describe("audit API base URL", () => {
  it("targets NEXT_PUBLIC_API_URL or localhost:3001", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = stubFetchOk([]);

    await listAdminAuditEvents();

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl.startsWith(BASE)).toBe(true);
  });
});
