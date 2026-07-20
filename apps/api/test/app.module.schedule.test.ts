import "reflect-metadata";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { SchedulerRegistry } from "@nestjs/schedule";

import { AppModule } from "../src/app.module.js";

/**
 * TDD contract for the AppModule ScheduleModule.forRoot() wiring
 * (JD-1: JD-driven correction round 1).
 *
 * Without `ScheduleModule.forRoot()`, the `@Cron('0 3 * * *')`
 * decorator on `AuditRetentionSchedule` is metadata only — the
 * @nestjs/schedule `DiscoveryService` never picks it up and the
 * retention cron never registers in the `SchedulerRegistry`. With
 * `AUDIT_RETENTION_ENABLED=true`, the operator believes retention is
 * active; in production the cron is silently inactive.
 *
 * RED state (this file, commit JD-1-RED): the AppModule imports do
 * NOT include `ScheduleModule.forRoot()`. Boot the module, ask the
 * DI container for a `SchedulerRegistry`, and assert the audit-retention
 * cron is registered. The assertion fails because the schedule
 * module was never activated.
 *
 * GREEN (commit JD-1-GREEN): add `ScheduleModule.forRoot()` to
 * `AppModule` imports so the cron registers at boot.
 */

vi.mock("@core/database", () => ({
  prisma: {
    adminAuditEvent: {
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@core/logging", () => ({
  createLogger: () => ({
    level: "info",
    child: () => ({
      level: "info",
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const envRef = vi.hoisted(() => ({
  AUDIT_RETENTION_ENABLED: false,
  AUDIT_RETENTION_DAYS: 90,
}));

vi.mock("@core/config", () => ({ env: envRef }));

describe("AppModule — ScheduleModule.forRoot() wiring (JD-1)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    envRef.AUDIT_RETENTION_ENABLED = false;
    envRef.AUDIT_RETENTION_DAYS = 90;
  });

  afterEach(async () => {
    // No app handle to close here; tests create+close locally.
  });

  it("registers ScheduleModule so AuditRetentionSchedule's @Cron fires", async () => {
    // The audit-retention cron has no explicit `name` argument on
    // `@Cron('0 3 * * *')` so @nestjs/schedule assigns a random
    // UUID as the registry key. We therefore assert on the COUNT
    // of registered cron jobs (>=1) — proof that the schedule
    // module's DiscoveryService has scanned the wired modules and
    // registered at least the audit-retention cron.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const registry = app.get(SchedulerRegistry);
      expect(registry).toBeDefined();
      const cronNames = registry.getCronJobs();
      // At least one cron must be registered. The audit-retention
      // cron is the only cron in the wired feature modules.
      expect(cronNames.size).toBeGreaterThanOrEqual(1);
    } finally {
      await app.close();
    }
  });

  it("exposes SchedulerRegistry as a discoverable provider in the DI container", async () => {
    // Defense-in-depth: a missing ScheduleModule.forRoot() import
    // also breaks DI resolution of the registry. This is the
    // simpler surface-level check that complements the cron check
    // above — both fail RED in the same way (no module => no
    // provider), but testing both pins the diagnosis to a missing
    // import rather than a transient runtime race.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const registry = app.get(SchedulerRegistry);
      expect(registry).toBeInstanceOf(SchedulerRegistry);
    } finally {
      await app.close();
    }
  });
});
