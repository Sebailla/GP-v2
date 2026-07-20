import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

/**
 * Task 4.1 RED — observability metrics counter increments (unit).
 *
 * Per `openspec/specs/observability/spec.md` and
 * `openspec/changes/module-5-production-hardening/design.md` §5, the
 * registry MUST expose 7 PII-safe counters:
 *
 *   - auth_login_success_total{email_domain}
 *   - auth_login_failure_total{reason, email_domain}
 *   - auth_password_reset_requested_total
 *   - auth_password_reset_completed_total
 *   - auth_admin_operation_total{operation, actor_role}
 *   - auth_session_validations_total
 *   - auth_session_validations_failed_total
 *
 * The test exercises the registry directly (no HTTP, no NestJS DI
 * overhead) — `registry.ts` is the canonical source of truth for
 * counter names, labels, and increment semantics.
 *
 * RED gate: the test imports counter names that do NOT yet exist
 * in the registry. The TypeScript import resolution fails at
 * compile time, satisfying the strict TDD RED contract. Once
 * task 4.2 GREEN registers the counters, the import resolves and
 * the assertions run.
 *
 * Coverage:
 *  - happy: each counter is exposed by the registry and increments
 *  - triangulation: labelled counters accept label sets without
 *    collisions
 *  - privacy: only `email_domain` / `reason` / `operation` /
 *    `actor_role` labels are exposed — no email / IP / UUID / ip_address
 */

import { metricsRegistry } from "../src/modules/metrics/registry.js";
import {
  authLoginSuccessTotal,
  authLoginFailureTotal,
  authPasswordResetRequestedTotal,
  authPasswordResetCompletedTotal,
  authAdminOperationTotal,
  authSessionValidationsTotal,
  authSessionValidationsFailedTotal,
} from "../src/modules/metrics/registry.js";

describe("observability metrics counters (4.1 RED — registry exposure)", () => {
  beforeEach(() => {
    // Reset all counters before each test so prior increments do
    // not bleed across cases (prom-client counters persist in the
    // process-global registry).
    metricsRegistry.resetMetrics();
  });

  afterEach(() => {
    metricsRegistry.resetMetrics();
  });

  it("exposes auth_login_success_total with email_domain label", async () => {
    authLoginSuccessTotal.inc({ email_domain: "example.com" });
    const body = await metricsRegistry.metrics();
    expect(body).toContain('auth_login_success_total{email_domain="example.com"} 1');
  });

  it("exposes auth_login_failure_total with reason + email_domain labels", async () => {
    authLoginFailureTotal.inc({
      reason: "invalid_credentials",
      email_domain: "example.com",
    });
    const body = await metricsRegistry.metrics();
    expect(body).toContain(
      'auth_login_failure_total{reason="invalid_credentials",email_domain="example.com"} 1',
    );
  });

  it("exposes auth_password_reset_requested_total and _completed_total", async () => {
    authPasswordResetRequestedTotal.inc();
    authPasswordResetCompletedTotal.inc();
    const body = await metricsRegistry.metrics();
    expect(body).toMatch(/auth_password_reset_requested_total 1/);
    expect(body).toMatch(/auth_password_reset_completed_total 1/);
  });

  it("exposes auth_admin_operation_total with operation + actor_role labels", async () => {
    authAdminOperationTotal.inc({
      operation: "list_users",
      actor_role: "ADMIN",
    });
    const body = await metricsRegistry.metrics();
    expect(body).toContain(
      'auth_admin_operation_total{operation="list_users",actor_role="ADMIN"} 1',
    );
  });

  it("exposes auth_session_validations_total and _failed_total", async () => {
    authSessionValidationsTotal.inc();
    authSessionValidationsFailedTotal.inc();
    const body = await metricsRegistry.metrics();
    expect(body).toMatch(/auth_session_validations_total 1/);
    expect(body).toMatch(/auth_session_validations_failed_total 1/);
  });

  it("label-set triangulation: distinct email_domains do not collide", async () => {
    authLoginSuccessTotal.inc({ email_domain: "a.example.com" });
    authLoginSuccessTotal.inc({ email_domain: "b.example.com" });
    authLoginSuccessTotal.inc({ email_domain: "a.example.com" });
    const body = await metricsRegistry.metrics();
    expect(body).toContain(
      'auth_login_success_total{email_domain="a.example.com"} 2',
    );
    expect(body).toContain(
      'auth_login_success_total{email_domain="b.example.com"} 1',
    );
  });

  it("label-set triangulation: distinct failure reasons do not collide", async () => {
    authLoginFailureTotal.inc({
      reason: "invalid_credentials",
      email_domain: "x.example.com",
    });
    authLoginFailureTotal.inc({
      reason: "rate_limited",
      email_domain: "x.example.com",
    });
    const body = await metricsRegistry.metrics();
    expect(body).toContain(
      'auth_login_failure_total{reason="invalid_credentials",email_domain="x.example.com"} 1',
    );
    expect(body).toContain(
      'auth_login_failure_total{reason="rate_limited",email_domain="x.example.com"} 1',
    );
  });

  it("label-set triangulation: distinct admin operations do not collide", async () => {
    authAdminOperationTotal.inc({ operation: "list_users", actor_role: "ADMIN" });
    authAdminOperationTotal.inc({
      operation: "change_role",
      actor_role: "ADMIN",
    });
    const body = await metricsRegistry.metrics();
    expect(body).toContain(
      'auth_admin_operation_total{operation="list_users",actor_role="ADMIN"} 1',
    );
    expect(body).toContain(
      'auth_admin_operation_total{operation="change_role",actor_role="ADMIN"} 1',
    );
  });

  it("privacy contract: the registry body MUST NOT contain any label value with @", async () => {
    // Even with hypothetical misusage (caller should NEVER pass raw email
    // — domain-only is the contract), the assertion proves the test
    // fixture stays PII-free.
    authLoginSuccessTotal.inc({ email_domain: "example.com" });
    const body = await metricsRegistry.metrics();
    expect(body).not.toContain("@");
    expect(body).not.toMatch(/"ip_address"/);
  });
});
