import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Server } from "http";

/**
 * Task 2.7 RED — `AdminController` audit endpoints (NestJS e2e).
 *
 * Per `openspec/changes/module-4-privacy/design.md` D4 + §5 the
 * controller extends the M3 admin surface with two new endpoints
 * under `/admin/audit`:
 *
 *   GET  /admin/audit?actorId=&targetId=&action=&since=&until=&limit=&offset=
 *        → 200 [{ id, actorId, targetId, action, createdAt, metadata,
 *                ipAddress, userAgent }]
 *        → 400 invalid query (Zod validation error)
 *        → 403 non-admin; 401 unauth
 *
 *   POST /admin/audit/purge  body: { dryRun: bool, olderThanDays: int ≥ 1 }
 *        → 200 { matched, [wouldDelete | deleted] }  (key depends on dryRun)
 *        → 400 invalid body; 403 non-admin
 *
 * Coverage per endpoint (4 endpoints × happy + edge + error + 403 + 401):
 *   GET /admin/audit:
 *     - happy: returns rows DESC by createdAt with full filter set
 *     - edge: empty result set returns `[]`
 *     - edge: very large `limit=999` → Zod 400 (per task 2.11 triangulation)
 *     - error: action=GOD → Zod 400 (per task 2.11 triangulation)
 *     - 403: non-admin → forbidden
 *     - 401: no bearer → unauthorized
 *   POST /admin/audit/purge:
 *     - happy dryRun: returns { matched, wouldDelete }
 *     - happy real:   returns { matched, deleted } and routes to purgeOlderThan
 *     - edge idempotent: dryRun after purge → 0
 *     - 403: non-admin → forbidden
 *
 * Pattern conventions (from `admin.controller.test.ts` M3):
 *   - Mock `@core/database` (prisma) — no real DB connection.
 *   - `.overrideProvider(RATE_LIMITER_TOKEN)` with `InMemoryRateLimiter`
 *     so the rate-limit guard doesn't reject the request burst.
 *   - Mint NextAuth JWTs with `next-auth/jwt#encode` + the canonical
 *     `NEXTAUTH_SESSION_TOKEN_NAME` salt.
 *
 * The `AuditService` is provided via `.overrideProvider(AuditService)`
 * so we don't have to mock the prisma delegates individually — the
 * controller receives a typed `AuditService` whose methods we stub.
 */

const TEST_NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long-for-hkdf";

const mintToken = async (
  claims: {
    sub: string;
    email: string;
    role: "USER" | "ADMIN";
    userId: string;
  },
  options?: { maxAgeSeconds?: number },
): Promise<string> =>
  encode({
    token: { ...claims, name: null, picture: null },
    secret: TEST_NEXTAUTH_SECRET,
    salt: "authjs.session-token",
    maxAge: options?.maxAgeSeconds ?? 30 * 24 * 60 * 60,
  });

// pino sink mock — same pattern as the M3 test, but the audit
// endpoints don't currently emit their own log lines (the prune log
// line lives in the cron, task 2.10). We still mock `@core/logging`
// so any future `logger.info` call from the audit endpoints lands in
// a sink we can assert against.
const pinoSink: { lines: string[] } = { lines: [] };
const fakeLogger = {
  level: "info",
  child: () => fakeLogger,
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: (obj: unknown, msg?: string) => {
    pinoSink.lines.push(JSON.stringify({ ...(obj as object), msg }));
  },
  debug: vi.fn(),
  trace: vi.fn(),
};

vi.mock("@core/logging", () => ({
  createLogger: () => fakeLogger,
  redactedPaths: ["ip", "*.ip"],
}));

vi.mock("@core/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    adminAuditEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    verificationToken: { create: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@core/database";
import { InMemoryRateLimiter } from "@core/rate-limit";
import { AuthModule } from "../src/modules/auth/auth.module.js";
import { AdminModule } from "../src/modules/auth/admin.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";

import type { AuditService } from "@features/auth";

describe("AdminController audit endpoints (M4 task 2.7 RED)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let auditServiceMock: {
    findMany: ReturnType<typeof vi.fn>;
    countOlderThan: ReturnType<typeof vi.fn>;
    purgeOlderThan: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: unknown) => {
      return (callback as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }) as never);
    auditServiceMock = {
      findMany: vi.fn(),
      countOlderThan: vi.fn(),
      purgeOlderThan: vi.fn(),
    };
    // Resolve the AuditService class via dynamic import so the same
    // module reference NestJS uses becomes the overrideProvider key.
    // Static `require("@features/auth")` fails at module-load time
    // under vitest's strict ESM resolver (the workspace symlink points
    // to a TS source the resolver treats as `.js` extensions only).
    const authModule = await import("@features/auth");
    const auditServiceCtor = authModule.AuditService as unknown as new (...args: unknown[]) => AuditService;

    moduleRef = await Test.createTestingModule({
      imports: [AuthModule, AdminModule],
    })
      .overrideProvider(RATE_LIMITER_TOKEN)
      .useValue(new InMemoryRateLimiter())
      // Override the AuditService provider so the controller receives a
      // stub we control. The AuditService DI token is the class itself
      // (per the NestJS factory provider pattern from `admin.module.ts`).
      .overrideProvider(auditServiceCtor)
      .useValue(auditServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  describe("Routing guards (2 endpoints × 401/403)", () => {
    it.each([
      ["GET", "/admin/audit"],
      ["POST", "/admin/audit/purge"],
    ] as const)("%s %s → 401 when no bearer token", async (method, path) => {
      const http = request(app.getHttpServer() as Server);
      const res =
        method === "GET"
          ? await http.get(path)
          : await http.post(path).send({ dryRun: true, olderThanDays: 90 });
      expect(res.status).toBe(401);
    });

    it.each([
      ["GET", "/admin/audit"],
      ["POST", "/admin/audit/purge"],
    ] as const)("%s %s → 403 when role === USER", async (method, path) => {
      const userJwt = await mintToken({
        sub: "u-user",
        email: "alice@example.com",
        role: "USER",
        userId: "u-user",
      });
      const http = request(app.getHttpServer() as Server);
      const res =
        method === "GET"
          ? await http.get(path).set("Authorization", `Bearer ${userJwt}`)
          : await http
              .post(path)
              .set("Authorization", `Bearer ${userJwt}`)
              .send({ dryRun: true, olderThanDays: 90 });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /admin/audit", () => {
    it("returns 200 + the audit rows when the caller is ADMIN (happy)", async () => {
      const rows = [
        {
          id: "a-1",
          actorId: "admin-1",
          targetId: "u-target",
          action: "CHANGE_ROLE",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          metadata: { from: "USER", to: "ADMIN" },
          ipAddress: "deadbeef".repeat(8),
          userAgent: "Mozilla/5.0",
        },
      ];
      auditServiceMock.findMany.mockResolvedValue(rows);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/audit")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: "a-1",
        actorId: "admin-1",
        action: "CHANGE_ROLE",
      });
    });

    it("returns 200 + empty array when no rows match (edge)", async () => {
      auditServiceMock.findMany.mockResolvedValue([]);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/audit?actorId=12345678-1234-1234-8234-123456789012")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("forwards the validated query to AuditService.findMany (audit.service wiring)", async () => {
      auditServiceMock.findMany.mockResolvedValue([]);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get(
          "/admin/audit?actorId=12345678-1234-1234-8234-123456789012&action=REVOKE_SESSION&limit=10",
        )
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(auditServiceMock.findMany).toHaveBeenCalledTimes(1);
      const call = auditServiceMock.findMany.mock.calls[0] as unknown as [
        { actorId?: string; action?: string; limit?: number },
      ];
      expect(call[0].actorId).toBe("12345678-1234-1234-8234-123456789012");
      expect(call[0].action).toBe("REVOKE_SESSION");
      expect(call[0].limit).toBe(10);
    });

    it("returns 400 when action is outside the closed enum (task 2.11 triangulation: `action=GOD`)", async () => {
      // Triangulation from task 2.11: an admin client sends a typo
      // (`action=GOD`). Zod's enum validation rejects the value at the
      // boundary, the controller emits 400 — no DB call, no error
      // leak from Prisma's enum column.
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/audit?action=GOD")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(400);
      expect(auditServiceMock.findMany).not.toHaveBeenCalled();
    });

    it("returns 400 when limit is above the 200 ceiling (task 2.11 triangulation: `limit=999`)", async () => {
      // Triangulation from task 2.11: a malicious or buggy client
      // sends `?limit=999`. Zod's `.max(200)` rejects the value with a
      // clear validation error rather than silently clamping — the
      // operator sees the bad input as a 400.
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/audit?limit=999")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(400);
      expect(auditServiceMock.findMany).not.toHaveBeenCalled();
    });

    it("returns 400 when actorId is not a UUID", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/audit?actorId=not-a-uuid")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(400);
      expect(auditServiceMock.findMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /admin/audit/purge", () => {
    it("dry-run path: returns { matched, wouldDelete } without calling purgeOlderThan", async () => {
      auditServiceMock.countOlderThan.mockResolvedValue(42);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/audit/purge")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ dryRun: true, olderThanDays: 90 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ matched: 42, wouldDelete: 42 });
      expect(auditServiceMock.countOlderThan).toHaveBeenCalledTimes(1);
      // The dry-run path MUST NOT call purgeOlderThan — the spec's
      // "MUST NOT delete rows" mandate.
      expect(auditServiceMock.purgeOlderThan).not.toHaveBeenCalled();
    });

    it("real-purge path: returns { matched, deleted } and calls purgeOlderThan", async () => {
      auditServiceMock.purgeOlderThan.mockResolvedValue(7);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/audit/purge")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ dryRun: false, olderThanDays: 30 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ matched: 7, deleted: 7 });
      expect(auditServiceMock.purgeOlderThan).toHaveBeenCalledTimes(1);
      // Real purge MUST NOT call countOlderThan — the spec mandates a
      // single atomic deleteMany (idempotent on second call).
      expect(auditServiceMock.countOlderThan).not.toHaveBeenCalled();
    });

    it("idempotent: a real purge after a previous purge returns { matched: 0, deleted: 0 }", async () => {
      auditServiceMock.purgeOlderThan.mockResolvedValue(0);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/audit/purge")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ dryRun: false, olderThanDays: 90 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ matched: 0, deleted: 0 });
    });

    it("returns 400 when olderThanDays < 1 (spec: olderThanDays MUST be ≥ 1)", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/audit/purge")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ dryRun: true, olderThanDays: 0 });

      expect(res.status).toBe(400);
      expect(auditServiceMock.countOlderThan).not.toHaveBeenCalled();
      expect(auditServiceMock.purgeOlderThan).not.toHaveBeenCalled();
    });

    it("returns 400 when dryRun is missing", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/audit/purge")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ olderThanDays: 90 });

      expect(res.status).toBe(400);
    });
  });
});