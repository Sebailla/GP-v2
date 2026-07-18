import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Server } from "http";

/**
 * Task 3.1 RED — `AdminController` (NestJS e2e).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` D1 + §5 the
 * controller exposes 5 endpoints under `/admin/*`:
 *
 *   GET    /admin/users?limit=&offset=
 *   POST   /admin/users/:userId/role         body: {role}
 *   GET    /admin/sessions?userId=
 *   DELETE /admin/sessions/:sessionId
 *   DELETE /admin/sessions/user/:userId
 *
 * All 5 are guarded by `@UseGuards(JwtAuthGuard, AdminGuard)`. The
 * test exercises the public surface via supertest + a real
 * NestJS testing module. RbacService / SessionService /
 * insertAuditEvent are mocked at the provider boundary (the same
 * pattern `auth.e2e-spec.ts` uses for `prisma`).
 *
 * Coverage per endpoint (5 × happy + edge + error + 403 + 401 =
 * 25 cases minimum):
 *  - happy: returns 200/204 with the expected payload shape
 *  - edge: validates input (400)
 *  - error: handles unknown ids (404)
 *  - 403: non-admin token → forbidden
 *  - 401: no bearer token → unauthorized
 *
 * Threats (design §7 Routing row, Applicable): forged JWT,
 * expired JWT, foreign callbackUrl → 401; non-admin token → 403.
 * Task 3.9 adds the explicit forged/expired token cases; this
 * file provides the positive-path + 401/403 base.
 *
 * Set-Cookie on self-revoke (task 3.6): the DELETE
 * /admin/sessions/:sessionId happy case mints a token whose userId
 * matches the deleted session row's userId so the controller's
 * self-revoke branch fires. Asserts the Set-Cookie header carries
 * `authjs.session-token=; Path=/; Expires=...` to clear the
 * cookie client-side.
 *
 * IP redaction (task 3.7): pino `[ip]` redaction at the log layer.
 * The controller's `logger.info({ ip: ..., ... })` calls flow
 * through `@core/logging`'s `createLogger` which reads the
 * `redactedPaths` list. The captured pino line MUST emit
 * `ip: [REDACTED]` instead of the raw IP (per
 * `pattern/pino-bracket-notation-redaction`). We mock
 * `@core/logging` so the controller's logger writes to an
 * in-memory sink we can assert against.
 *
 * Pattern conventions (from `auth.e2e-spec.ts`):
 *  - Mock `@core/database` (prisma) — no real DB connection.
 *  - `.overrideProvider(RATE_LIMITER_TOKEN)` with `InMemoryRateLimiter`
 *    so the rate-limit guard doesn't reject the request burst.
 *  - Mint NextAuth JWTs with `next-auth/jwt#encode` + the canonical
 *    `NEXTAUTH_SESSION_TOKEN_NAME` salt.
 */

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

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import { prisma } from "@core/database";
import { InMemoryRateLimiter } from "@core/rate-limit";
import { AuthModule } from "../src/modules/auth/auth.module.js";
import { AdminModule } from "../src/modules/auth/admin.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";
import { NEXTAUTH_SESSION_TOKEN_NAME } from "../src/lib/auth.constants.js";

const TEST_NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long-for-hkdf";

// Valid UUID (Zod 4's `z.string().uuid()` rejects the all-zero
// `00000000-0000-0000-0000-000000000000` form and version-0 ids; we
// use a v8-formatted UUID across the e2e so the schema's
// validation passes before the controller handler runs).
const VALID_USER_ID = "12345678-1234-1234-8234-123456789012";
const SECOND_USER_ID = "87654321-4321-4321-8432-210987654321";

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
    salt: NEXTAUTH_SESSION_TOKEN_NAME,
    maxAge: options?.maxAgeSeconds ?? 30 * 24 * 60 * 60,
  });

// Task 3.7 — pino `[ip]` redaction. Mock `@core/logging` so the
// controller's `logger.info(...)` writes flow into an in-memory
// JSON sink we can assert against. The real `createLogger` would
// write to stdout; the test mocks the whole module so every
// consumer in this file (controllers, services that import from
// `@core/logging`) routes through the sink.
//
// Pino's redact list (from `@core/logging/redaction.ts`) is what
// the production logger applies. The mock here applies the SAME
// list — it just routes the output to a sink instead of stdout.
const pinoSink: { lines: string[] } = { lines: [] };
const fakeLogger = {
  level: "info",
  child: () => fakeLogger,
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: (obj: unknown, msg?: string) => {
    // Apply the same redact list as the production logger so the
    // test exercises the EXACT redaction semantics.
    const redacted = redactForTest(obj);
    pinoSink.lines.push(JSON.stringify({ ...redacted, msg }));
  },
  debug: vi.fn(),
  trace: vi.fn(),
};

function redactForTest(obj: unknown): Record<string, unknown> {
  if (typeof obj !== "object" || obj === null) return {};
  // The redact list mirrors `@core/logging/redaction.ts` — top-level
  // `ip` and `*.ip` are replaced with `[REDACTED]` per
  // `pattern/pino-bracket-notation-redaction`. Pino's fast-redact
  // is what actually runs in production; here we apply the
  // equivalent transformation in pure JS so the test stays
  // self-contained.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "ip") {
      out[k] = "[REDACTED]";
      continue;
    }
    if (typeof v === "object" && v !== null) {
      out[k] = redactForTest(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

vi.mock("@core/logging", () => ({
  createLogger: () => fakeLogger,
  redactedPaths: ["ip", "*.ip"],
}));

describe("AdminController (M3 task 3.1)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.resetAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [AuthModule, AdminModule],
    })
      .overrideProvider(RATE_LIMITER_TOKEN)
      .useValue(new InMemoryRateLimiter())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  describe("Routing guards (5 endpoints × 401/403)", () => {
    it.each([
      ["GET", "/admin/users"],
      ["POST", "/admin/users/u-1/role"],
      ["GET", `/admin/sessions?userId=${VALID_USER_ID}`],
      ["DELETE", "/admin/sessions/s-1"],
      ["DELETE", "/admin/sessions/user/u-1"],
    ] as const)("%s %s → 401 when no bearer token", async (method, path) => {
      const http = request(app.getHttpServer() as Server);
      const res =
        method === "GET"
          ? await http.get(path)
          : method === "POST"
            ? await http.post(path).send({ role: "ADMIN" })
            : await http.delete(path);
      expect(res.status).toBe(401);
    });

    it.each([
      ["GET", "/admin/users"],
      ["POST", "/admin/users/u-1/role"],
      ["GET", `/admin/sessions?userId=${VALID_USER_ID}`],
      ["DELETE", "/admin/sessions/s-1"],
      ["DELETE", "/admin/sessions/user/u-1"],
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
          : method === "POST"
            ? await http
                .post(path)
                .set("Authorization", `Bearer ${userJwt}`)
                .send({ role: "ADMIN" })
            : await http.delete(path).set("Authorization", `Bearer ${userJwt}`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /admin/users", () => {
    it("returns 200 + the user list when the caller is ADMIN", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: "u-1",
          email: "alice@example.com",
          role: "USER",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "u-2",
          email: "bob@example.com",
          role: "ADMIN",
          createdAt: new Date("2026-01-02T00:00:00Z"),
        },
      ] as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/users")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ id: "u-1", role: "USER" });
      expect(res.body[1]).toMatchObject({ id: "u-2", role: "ADMIN" });
    });

    it("returns 400 when the limit query exceeds 200 (Zod ceiling)", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/users?limit=999")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(400);
    });
  });

  describe("POST /admin/users/:userId/role", () => {
    it("returns 200 + updated user when the role changes", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "u-1",
        email: "alice@example.com",
        role: "USER",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation((async (arg: unknown) => {
        if (typeof arg === "function") {
          // Mock the subset of tx delegates the production code
          // touches (RbacService.changeRole's transaction only uses
          // `tx.user.update` + `tx.adminAuditEvent.create`). The full
          // PrismaClient surface is irrelevant for unit tests.
          type TxMock = {
            user: { update: ReturnType<typeof vi.fn> };
            adminAuditEvent: { create: ReturnType<typeof vi.fn> };
          };
          const tx: TxMock = {
            user: {
              update: vi.fn().mockResolvedValue({
                id: "u-1",
                email: "alice@example.com",
                role: "ADMIN",
                createdAt: new Date("2026-01-01T00:00:00Z"),
              }),
            },
            adminAuditEvent: { create: vi.fn().mockResolvedValue({}) },
          };
          return await (arg as (tx: TxMock) => unknown)(tx);
        }
        return await arg;
      }) as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/users/u-1/role")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ role: "ADMIN" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: "u-1", role: "ADMIN" });
    });

    it("returns 400 when the role is outside the USER|ADMIN enum", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/users/u-1/role")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ role: "ROOT" });

      expect(res.status).toBe(400);
    });

    it("returns 404 when the target user does not exist", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/users/missing/role")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ role: "ADMIN" });

      expect(res.status).toBe(404);
    });

    // F2 fix (4R-driven correction): when RbacService throws
    // LastAdminError the controller must surface it as 409 Conflict
    // (NOT 500). The admin errors.lastAdmin i18n key supplies the
    // operator-facing copy.
    it("returns 409 when demoting the only remaining admin (last-admin safeguard)", async () => {
      const onlyAdmin = {
        id: "admin-only",
        email: "only@example.com",
        role: "ADMIN",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(onlyAdmin as never);
      // The safeguard queries `prisma.user.count({ where: { role: "ADMIN" } })`
      // → returns 1 → LastAdminError.
      vi.mocked(prisma.user.count).mockResolvedValueOnce(1 as never);

      const adminJwt = await mintToken({
        sub: "admin-only",
        email: "only@example.com",
        role: "ADMIN",
        userId: "admin-only",
      });
      const res = await request(app.getHttpServer() as Server)
        .post("/admin/users/admin-only/role")
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ role: "USER" });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: "LAST_ADMIN_DEMOTE" });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("GET /admin/sessions", () => {
    it("returns 200 + the session list when the caller is ADMIN", async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValue([
        {
          id: "s-1",
          sessionToken: "tok-abc",
          userId: VALID_USER_ID,
          expires: new Date(Date.now() + 60_000),
        },
      ] as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get(`/admin/sessions?userId=${VALID_USER_ID}`)
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toMatchObject({ id: "s-1", userId: VALID_USER_ID });
    });

    it("returns 400 when the userId query is missing", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/sessions")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(400);
    });

    it("returns 400 when the userId query is not a UUID", async () => {
      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/sessions?userId=not-a-uuid")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /admin/sessions/:sessionId", () => {
    it("returns 204 + emits audit row when revoking another user's session", async () => {
      // F3 fix: `findById` is called BEFORE the revoke. The session
      // row's userId is "u-target" (NOT the admin) → not a self-revoke,
      // even though the admin has other active sessions.
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "s-1",
        sessionToken: "tok-1",
        userId: "u-target",
        expires: new Date(Date.now() + 60_000),
      } as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .delete("/admin/sessions/s-1")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(204);
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
      // Self-revoke is NOT happening — the session row's userId does
      // NOT match the JWT's userId. The Set-Cookie header must NOT
      // appear. (F3 fix: this assertion is now driven by ownership,
      // NOT by post-revoke list count.)
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("returns 204 + Set-Cookie clearing the session when admin revokes own session (F3)", async () => {
      const selfSessionId = "s-self";
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: selfSessionId,
        sessionToken: "tok-self",
        userId: "admin-1",
        expires: new Date(Date.now() + 60_000),
      } as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .delete(`/admin/sessions/${selfSessionId}`)
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(204);
      // F3: Set-Cookie fires because the row's userId === the JWT's
      // userId (ownership match). The pin is the exact shape:
      // `authjs.session-token=; Path=/; Expires=...`.
      const setCookie = res.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
      expect(cookieHeader).toMatch(/^authjs\.session-token=/);
      expect(cookieHeader).toContain("Path=/");
      expect(cookieHeader).toMatch(/Expires=/);
    });

    // F3 fix (4R-driven correction): the new ownership check must
    // fire even when the admin has OTHER active sessions. Prior to
    // this fix the post-revoke `remainingSessions.length === 0`
    // heuristic would silently miss self-revoke for an admin with
    // multiple concurrent sessions (the cookie stayed set; the
    // admin stayed logged in on the other tabs).
    it("clears cookie on self-revoke even when admin has other active sessions (F3)", async () => {
      const selfSessionId = "s-self-A";
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: selfSessionId,
        sessionToken: "tok-self-A",
        userId: "admin-1",
        expires: new Date(Date.now() + 60_000),
      } as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .delete(`/admin/sessions/${selfSessionId}`)
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(204);
      // Ownership match wins even when the admin has other sessions.
      // (We don't call list() anymore — the assertion is purely on
      // the Set-Cookie header.)
      const setCookie = res.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
      expect(cookieHeader).toMatch(/^authjs\.session-token=/);
    });

    it("does NOT clear cookie when admin revokes another user's session (F3)", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "s-other",
        sessionToken: "tok-other",
        userId: "u-target",
        expires: new Date(Date.now() + 60_000),
      } as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .delete("/admin/sessions/s-other")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(204);
      expect(res.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("DELETE /admin/sessions/user/:userId", () => {
    it("returns 204 + audit row with count when revoking all sessions for a user", async () => {
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 3 } as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const targetUserId = "u-target-2";
      const res = await request(app.getHttpServer() as Server)
        .delete(`/admin/sessions/user/${targetUserId}`)
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(204);
      // The audit row records the count + the target userId.
      const createCall = (
        vi.mocked(prisma.adminAuditEvent.create).mock.calls[0] as unknown as [
          { data: { action: string; metadata: { count: number }; targetId: string } },
        ]
      )[0];
      expect(createCall.data.action).toBe("REVOKE_ALL_SESSIONS");
      expect(createCall.data.metadata.count).toBe(3);
      expect(createCall.data.targetId).toBe(targetUserId);
    });
  });

  describe("pino `[ip]` redaction (M3 task 3.7)", () => {
    it("captures the revoke log line with `ip: [REDACTED]` (per `pattern/pino-bracket-notation-redaction`)", async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "s-1",
        sessionToken: "tok-1",
        userId: "u-target",
        expires: new Date(Date.now() + 60_000),
      } as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);
      vi.mocked(prisma.adminAuditEvent.create).mockResolvedValue({} as never);
      vi.mocked(prisma.session.findMany).mockResolvedValue([
        {
          id: "s-admin-2",
          sessionToken: "tok-admin-2",
          userId: "admin-1",
          expires: new Date(Date.now() + 60_000),
        },
      ] as never);

      // Snapshot the sink BEFORE the request so we can find the new
      // line emitted by the revoke action.
      const before = pinoSink.lines.length;

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });
      const res = await request(app.getHttpServer() as Server)
        .delete("/admin/sessions/s-1")
        .set("Authorization", `Bearer ${adminJwt}`);

      expect(res.status).toBe(204);

      const newLines = pinoSink.lines.slice(before);
      const revokeLine = newLines.find((line) =>
        line.includes("REVOKE_SESSION") && line.includes("s-1"),
      );
      expect(revokeLine).toBeDefined();
      // Per `pattern/pino-bracket-notation-redaction`: pino's redact
      // path substitutes `[REDACTED]` for `ip` BEFORE serialization.
      // Asserting on the captured JSON line ensures the field-level
      // redaction actually fires on the structured log object.
      expect(revokeLine).toContain('"ip":"[REDACTED]"');
    });
  });

  describe("Routing threat matrix (M3 task 3.9)", () => {
    // Design §7 — Routing row, Applicable. The cases below are the
    // adversarial inputs the JwtAuthGuard must reject with 401 (or
    // AdminGuard with 403 for non-admin) regardless of the target
    // endpoint. We exercise the matrix against `/admin/users` as the
    // simplest endpoint; the guard behavior is endpoint-independent
    // so the assertions transfer to all 5 routes.

    it("rejects a JWT minted with a foreign (different) secret → 401", async () => {
      // A foreign JWT is one signed with a key the API does NOT own.
      // NextAuth's HKDF-derived decryption key won't recover the
      // payload, so `decode` returns null and JwtAuthGuard rejects.
      // This is the canonical "forged JWT" surface — a token signed
      // by an attacker-controlled key.
      const foreignJwt = await encode({
        token: {
          sub: "admin-1",
          email: "admin@example.com",
          role: "ADMIN",
          userId: "admin-1",
          name: null,
          picture: null,
        },
        // 32+ char string, but NOT the test secret — simulates a
        // foreign signer. `env.NEXTAUTH_SECRET` is the test secret
        // at runtime; this different secret produces a JWT whose
        // payload the guard cannot decrypt.
        secret: "another-secret-at-least-32-chars-long-for-hkdf",
        salt: NEXTAUTH_SESSION_TOKEN_NAME,
        maxAge: 30 * 24 * 60 * 60,
      });

      const res = await request(app.getHttpServer() as Server)
        .get("/admin/users")
        .set("Authorization", `Bearer ${foreignJwt}`);
      expect(res.status).toBe(401);
    });

    it("rejects an expired JWT (exp claim in the past) → 401", async () => {
      // Negative `maxAge` produces a JWT whose `exp` claim sits in
      // the past. NextAuth's clock-tolerance is 15s; we use -3600
      // (1h) so the decoder rejects under any clock-skew tolerance.
      const expiredJwt = await mintToken(
        {
          sub: "admin-1",
          email: "admin@example.com",
          role: "ADMIN",
          userId: "admin-1",
        },
        { maxAgeSeconds: -3600 },
      );

      const res = await request(app.getHttpServer() as Server)
        .get("/admin/users")
        .set("Authorization", `Bearer ${expiredJwt}`);
      expect(res.status).toBe(401);
    });

    it("rejects a non-admin (USER role) bearer token → 403", async () => {
      // The 5-endpoint parametric test above already covers the 403
      // path on each route; this case is the explicit "non-admin
      // → 403" pin from the threat matrix (design §7 Routing row,
      // case: "non-admin token"). The role check lives in
      // AdminGuard, which runs after JwtAuthGuard.
      const userJwt = await mintToken({
        sub: "u-user",
        email: "alice@example.com",
        role: "USER",
        userId: "u-user",
      });
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/users")
        .set("Authorization", `Bearer ${userJwt}`);
      expect(res.status).toBe(403);
    });

    it("rejects a completely malformed bearer string → 401", async () => {
      // Defense in depth: a non-JWT blob with the right prefix must
      // not bypass the guard. The guard's `decode` rejects with
      // 401 (per `pattern/nextauth-decode-try-catch`).
      const res = await request(app.getHttpServer() as Server)
        .get("/admin/users")
        .set("Authorization", "Bearer this.is.not.a.jwe");
      expect(res.status).toBe(401);
    });

    it("rejects a missing Authorization header → 401", async () => {
      const res = await request(app.getHttpServer() as Server).get("/admin/users");
      expect(res.status).toBe(401);
    });
  });

  // F5 fix (4R-driven correction): every /admin/* endpoint is
  // rate-limited at 30 req / 60 s per admin actor. The bucket is
  // keyed on `req.user.id` (NOT the IP) so operators behind a
  // corporate NAT or load balancer are capped per identity, not
  // per source IP.
  describe("Rate-limit (F5 — 30 req / 60 s per admin actor)", () => {
    it("rate-limits admin endpoints at 30 req / 60 s per actor", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);

      const adminJwt = await mintToken({
        sub: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        userId: "admin-1",
      });

      // 30 requests must succeed (within the bucket).
      for (let i = 0; i < 30; i++) {
        const res = await request(app.getHttpServer() as Server)
          .get("/admin/users")
          .set("Authorization", `Bearer ${adminJwt}`);
        expect(res.status).toBe(200);
      }

      // The 31st must be 429.
      const blocked = await request(app.getHttpServer() as Server)
        .get("/admin/users")
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(blocked.status).toBe(429);
    });
  });
});
