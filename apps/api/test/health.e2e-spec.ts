import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { env } from "@core/config";

import { HealthModule } from "../src/modules/health/health.module.js";

vi.mock("@core/database", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    backupRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
  latestBackupStatus: vi.fn().mockResolvedValue({ at: null, status: "never" }),
}));

describe("HealthController (e2e, R-PF-4)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Mirror `apps/api/src/main.ts` CORS wiring so the triangulation
    // in the CORS test below exercises the real allow-list. The
    // production bootstrap is owned by main.ts (T1.3); this keeps
    // the e2e surface identical without duplicating policy.
    app.enableCors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("GET /healthz returns 200 even when the database is unreachable", async () => {
    const res = await request(app.getHttpServer()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz returns 200 when migrations are applied and DB is reachable", async () => {
    const res = await request(app.getHttpServer()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", database: "ok" });
  });

  it("GET /readyz returns 503 when the database query fails", async () => {
    const { prisma } = await import("@core/database");
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("db-down"));
    const res = await request(app.getHttpServer()).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not-ready", database: "down" });
  });

  it("GET /status returns the public payload without secrets", async () => {
    const res = await request(app.getHttpServer()).get("/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      environment: expect.any(String),
      version: expect.any(String),
      commit: expect.any(String),
      uptimeSeconds: expect.any(Number),
      publicUrl: { web: expect.any(String), api: expect.any(String) },
      lastBackupStatus: expect.stringMatching(/^(ok|failed|never)$/),
      rateLimitStore: expect.any(String),
      mailAdapter: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain("JWT_SECRET");
    expect(JSON.stringify(res.body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(res.body)).not.toContain("MAIL_DSN");
  });

  it("GET /status sets CORS headers when Origin matches the allow-list", async () => {
    const res = await request(app.getHttpServer())
      .get("/status")
      .set("Origin", env.WEB_ORIGIN);
    expect(res.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN);
  });
});