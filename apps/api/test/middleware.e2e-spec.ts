import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

void vi;

describe("request middleware (R-PF-4, R-PF-5)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [],
    }).compile();
    app = moduleRef.createNestApplication();
    const { requestIdMiddleware } = await import("../src/middleware/request-id.js");
    const { requestLoggerMiddleware } = await import(
      "../src/middleware/request-logger.js"
    );
    app.use(requestIdMiddleware);
    app.use(requestLoggerMiddleware);
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("sets x-request-id on every response", async () => {
    const res = await request(app.getHttpServer()).get("/healthz");
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });

  it("uses the inbound x-request-id when present", async () => {
    const inbound = "req-test-1234567890abcdef";
    const res = await request(app.getHttpServer())
      .get("/healthz")
      .set("x-request-id", inbound);
    expect(res.headers["x-request-id"]).toBe(inbound);
  });

  it("rejects inbound request id shorter than 8 chars and generates a new one", async () => {
    const res = await request(app.getHttpServer())
      .get("/healthz")
      .set("x-request-id", "short");
    expect(res.headers["x-request-id"]).not.toBe("short");
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });
});
