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

  it("returns Prometheus text including the 7 auth-observability counters (M5 D5 / task 4.2 GREEN)", async () => {
    // Task 4.3 RED + GREEN — the registry MUST register the 7 M5
    // auth counters and the `/metrics` scrape MUST surface them
    // even when no auth ops have run (so they appear with value 0).
    // The counters are emitted via `Counter.inc()`; before any
    // increment the body carries the `# TYPE ... counter` lines but
    // no sample line. Operators relying on Prometheus' metric
    // discovery depend on the `# TYPE` declaration being present
    // from boot — we therefore assert on the `# TYPE` lines.
    const { env } = await import("@core/config");
    const res = await request(app.getHttpServer())
      .get("/metrics")
      .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("# TYPE auth_login_success_total counter");
    expect(res.text).toContain("# TYPE auth_login_failure_total counter");
    expect(res.text).toContain("# TYPE auth_password_reset_requested_total counter");
    expect(res.text).toContain("# TYPE auth_password_reset_completed_total counter");
    expect(res.text).toContain("# TYPE auth_admin_operation_total counter");
    expect(res.text).toContain("# TYPE auth_session_validations_total counter");
    expect(res.text).toContain("# TYPE auth_session_validations_failed_total counter");
  });

  it("after counter increments, the /metrics scrape surfaces the sample line with the right labels (task 4.3 triangulation)", async () => {
    // The counters are process-global singletons on the registry
    // exposed by `apps/api/src/modules/metrics/registry.ts`. We
    // exercise them via the public API: import the same registry
    // module the MetricsController imports. The /metrics endpoint
    // serializes whatever the registry has — the assertion verifies
    // the wire-format end-to-end (counter increment → registry →
    // /metrics body).
    const { env } = await import("@core/config");
    const registry = await import("../src/modules/metrics/registry.js");
    // Reset so prior tests' increments do not pollute this one.
    registry.metricsRegistry.resetMetrics();
    registry.authLoginSuccessTotal.inc({ email_domain: "example.com" });
    registry.authAdminOperationTotal.inc({
      operation: "list_users",
      actor_role: "ADMIN",
    });
    registry.authSessionValidationsTotal.inc();

    const res = await request(app.getHttpServer())
      .get("/metrics")
      .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(
      'auth_login_success_total{email_domain="example.com"} 1',
    );
    expect(res.text).toContain(
      'auth_admin_operation_total{operation="list_users",actor_role="ADMIN"} 1',
    );
    expect(res.text).toMatch(/auth_session_validations_total 1/);
  });
});
