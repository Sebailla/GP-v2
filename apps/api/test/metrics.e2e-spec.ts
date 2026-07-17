import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { MetricsModule } from "../src/modules/metrics/metrics.module.js";

describe("MetricsController (e2e, R-PF-9)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MetricsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("returns 401 when the token is missing", async () => {
    const res = await request(app.getHttpServer()).get("/metrics");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is invalid", async () => {
    const res = await request(app.getHttpServer())
      .get("/metrics")
      .set("authorization", "Bearer wrong-token");
    expect(res.status).toBe(401);
  });

  it("returns Prometheus text with the expected metric names", async () => {
    const { env } = await import("@core/config");
    const res = await request(app.getHttpServer())
      .get("/metrics")
      .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("# TYPE http_requests_total counter");
    expect(res.text).toContain("# TYPE http_errors_5xx_total counter");
    expect(res.text).toContain("# TYPE rate_limit_blocked_total counter");
  });
});
