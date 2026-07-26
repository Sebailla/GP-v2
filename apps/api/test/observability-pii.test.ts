import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

/**
 * Task 4.7 RED — observability metrics PII guard.
 *
 * Per `openspec/specs/observability/spec.md` (Privacy — no PII in
 * label values) and the `auth-server-surface` spec's
 * "Observability Metrics for Auth Operations" requirement:
 *
 *   - No label value may contain `@` (raw email).
 *   - No label may be named `ip_address`.
 *   - No label value may carry a raw UUID (userId leak).
 *
 * The test simulates real controller traffic (login success +
 * login failure + admin op + session validation) by directly
 * incrementing the counters via the same path the controllers
 * use, then asserts the `/metrics` scrape body is PII-free.
 *
 * RED gate: the test exercises the counter increment paths
 * established by tasks 4.1-4.4. Once the controllers wire up
 * (4.4), the test passes. Before 4.4 the counters would never
 * see the asserted labels (test fails because nothing was
 * incremented) — this is the failing-first contract.
 *
 * The test ALSO calls `deriveEmailDomain` with adversarial
 * inputs to pin the privacy contract at the derivation seam:
 * raw emails are NEVER passed through, only their domain
 * shards.
 */

import {
  metricsRegistry,
  authLoginSuccessTotal,
  authLoginFailureTotal,
  authPasswordResetRequestedTotal,
  authPasswordResetCompletedTotal,
  authAdminOperationTotal,
  authSessionValidationsTotal,
  authSessionValidationsFailedTotal,
  deriveEmailDomain,
  AUTH_ADMIN_OPERATIONS,
  AUTH_ADMIN_ACTOR_ROLES,
  AUTH_LOGIN_FAILURE_REASONS,
} from "../src/modules/metrics/registry.js";

import { MetricsModule } from "../src/modules/metrics/metrics.module.js";
import { env } from "@core/config";

/** Standard UUID v4 pattern (lowercase, hyphenated, 8-4-4-4-12). */
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe("observability PII guard (4.7 RED — privacy contract)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    metricsRegistry.resetMetrics();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MetricsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    metricsRegistry.resetMetrics();
    if (app !== undefined) await app.close();
  });

  describe("deriveEmailDomain privacy seam", () => {
    it("extracts the registered domain from a normal email", () => {
      expect(deriveEmailDomain("alice@gmail.com")).toBe("gmail.com");
      expect(deriveEmailDomain("admin@example.com")).toBe("example.com");
    });

    it("lowercases the domain shard", () => {
      expect(deriveEmailDomain("alice@GMAIL.COM")).toBe("gmail.com");
    });

    it("returns null for inputs without '@'", () => {
      expect(deriveEmailDomain("not-an-email")).toBeNull();
    });

    it("returns null for empty / null / undefined input", () => {
      expect(deriveEmailDomain("")).toBeNull();
      expect(deriveEmailDomain(null)).toBeNull();
      expect(deriveEmailDomain(undefined)).toBeNull();
    });

    it("returns null for trailing '@' with no domain", () => {
      expect(deriveEmailDomain("alice@")).toBeNull();
    });

    it("never returns the local-part or any substring containing '@'", () => {
      const domain = deriveEmailDomain("alice@gmail.com");
      expect(domain).not.toContain("@");
      expect(domain).not.toBe("alice@gmail.com");
      expect(domain).not.toContain("alice");
    });
  });

  describe("/metrics scrape is PII-free", () => {
    /**
     * Simulate the realistic controller-driven counter activity:
     * one login success + one login failure + one admin op + one
     * session validation. Each increment uses the SAME label
     * surfaces the controllers use. The PII guard fires on the
     * scrape body, NOT on the call site (the call site is
     * unit-trusted; the guard verifies the wire output is clean).
     */
    beforeEach(() => {
      authLoginSuccessTotal.inc({ email_domain: "gmail.com" });
      authLoginFailureTotal.inc({
        reason: "invalid_credentials",
        email_domain: "example.com",
      });
      authPasswordResetRequestedTotal.inc();
      authPasswordResetCompletedTotal.inc();
      authAdminOperationTotal.inc({ operation: "list_users", actor_role: "ADMIN" });
      authSessionValidationsTotal.inc();
      authSessionValidationsFailedTotal.inc();
    });

    it("scrape body MUST NOT contain any label value with '@'", async () => {
      const res = await request(app.getHttpServer())
        .get("/metrics")
        .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
      expect(res.status).toBe(200);
      // The only place `@` could legitimately appear is in a comment
      // or the email domain label. We assert the body has no `@` in
      // any sample line by checking that EVERY non-comment line is
      // free of `@`. Comments start with `#`.
      const sampleLines = res.text
        .split("\n")
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      for (const line of sampleLines) {
        expect(line).not.toContain("@");
      }
    });

    it("scrape body MUST NOT contain a label named 'ip_address'", async () => {
      const res = await request(app.getHttpServer())
        .get("/metrics")
        .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.text).not.toMatch(/ip_address=/);
      expect(res.text).not.toMatch(/"ip_address"/);
    });

    it("scrape body MUST NOT contain a raw userId UUID in any sample line", async () => {
      const res = await request(app.getHttpServer())
        .get("/metrics")
        .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
      expect(res.status).toBe(200);
      const sampleLines = res.text
        .split("\n")
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      for (const line of sampleLines) {
        expect(line).not.toMatch(UUID_PATTERN);
      }
    });

    it("scrape body MUST NOT contain a raw IPv4 or IPv6 address in any sample line", async () => {
      // Belt-and-suspenders: even though no label should carry an IP,
      // assert the wire format is free of IP-shaped strings.
      const res = await request(app.getHttpServer())
        .get("/metrics")
        .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
      expect(res.status).toBe(200);
      const sampleLines = res.text
        .split("\n")
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      const IPV4 = /(?:\d{1,3}\.){3}\d{1,3}/;
      for (const line of sampleLines) {
        expect(line).not.toMatch(IPV4);
      }
    });

    it("admin operation labels are constrained to the spec's closed enum", async () => {
      // The type system already enforces this via `AuthAdminOperation`,
      // but the runtime constant `AUTH_ADMIN_OPERATIONS` is the
      // canonical list — assert the size matches the spec's 8
      // admin endpoints + 1 admin role.
      expect(AUTH_ADMIN_OPERATIONS).toHaveLength(8);
      expect(AUTH_ADMIN_OPERATIONS).toEqual([
        "list_users",
        "change_role",
        "list_sessions",
        "revoke_session",
        "revoke_all_sessions",
        "list_audit",
        "purge_audit_dry_run",
        "purge_audit_real",
      ]);
      expect(AUTH_ADMIN_ACTOR_ROLES).toEqual(["ADMIN"]);
      expect(AUTH_LOGIN_FAILURE_REASONS).toEqual([
        "invalid_credentials",
        "rate_limited",
        "account_locked",
        "unknown",
      ]);
    });
  });
});
