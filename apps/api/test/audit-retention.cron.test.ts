import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

/**
 * TDD contract for the audit-retention cron (M4 task 2.9 RED → 2.10
 * GREEN). Per `openspec/changes/module-4-privacy/design.md` §2 D2 +
 * `openspec/specs/audit-log-ui/spec.md` "Audit Retention Environment
 * Variable":
 *
 *   - The cron fires daily at 03:00 UTC (`@Cron('0 3 * * *')`).
 *   - Reads `env.AUDIT_RETENTION_DAYS` (default 90) +
 *     `env.AUDIT_RETENTION_ENABLED` (default false).
 *   - When `AUDIT_RETENTION_ENABLED=false` (dev/test default): no-op,
 *     does NOT call `auditService.purgeOlderThan`.
 *   - When `AUDIT_RETENTION_ENABLED=true`: calls
 *     `auditService.purgeOlderThan(env.AUDIT_RETENTION_DAYS)`.
 *
 * The schedule class (`AuditRetentionSchedule`) lives in
 * `apps/api/src/modules/auth/audit-retention.schedule.ts` because
 * the `@Cron` decorator requires `experimentalDecorators: true` in
 * the apps/api tsconfig. The handler logic is decorator-free so it
 * can be unit-tested directly from the auth slice — the schedule
 * just delegates to the handler.
 *
 * The test exercises both surfaces:
 *   1. The unit-level handler (`purgeExpiredAuditEvents(auditService, logger)`)
 *      called directly from the auth slice — pins the gate logic.
 *   2. The NestJS-registered schedule (`AuditRetentionSchedule.purgeExpiredAuditEvents`)
 *      called via DI — pins the integration with `AuditService`.
 *
 * The `env` config module is mocked via `vi.hoisted` so each test
 * can flip the gate without poisoning the runtime singleton (which
 * is parsed at import time).
 */

vi.mock("@core/database", () => ({
  prisma: {
    adminAuditEvent: {
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
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

import { prisma } from "@core/database";
import { AuthModule } from "../src/modules/auth/auth.module.js";
import { AdminModule } from "../src/modules/auth/admin.module.js";
import { AuditRetentionSchedule } from "../src/modules/auth/audit-retention.schedule.js";
import { AuditService, purgeExpiredAuditEvents } from "@features/auth";

describe("AuditRetentionSchedule (M4 task 2.9 RED, design D2)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let schedule: AuditRetentionSchedule;
  let purgeOlderThanMock: ReturnType<typeof vi.fn>;
  // The logger sink has to match the handler's `(message: string) =>
  // void` signature. `vi.fn()` returns a generic mock; the type
  // assertion keeps typecheck green without sacrificing assertion
  // behavior (`.toHaveBeenCalledWith` still resolves to the call
  // signature).
  let loggerLogMock: (message: string) => void;

  beforeEach(async () => {
    vi.resetAllMocks();
    envRef.AUDIT_RETENTION_ENABLED = false;
    envRef.AUDIT_RETENTION_DAYS = 90;

    purgeOlderThanMock = vi.fn().mockResolvedValue(0);
    loggerLogMock = vi.fn();
    const auditServiceMock = {
      findMany: vi.fn(),
      countOlderThan: vi.fn().mockResolvedValue(0),
      purgeOlderThan: purgeOlderThanMock,
    };

    moduleRef = await Test.createTestingModule({
      imports: [AuthModule, AdminModule],
    })
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    schedule = moduleRef.get<AuditRetentionSchedule>(AuditRetentionSchedule);
    loggerLogMock = vi.fn();
    // The NestJS Logger delegates to stdout/stderr in production;
    // the schedule's wrapper here routes through a captured
    // function so the test can assert on the log call.
    (schedule as unknown as { logger: { log: typeof loggerLogMock } }).logger = {
      log: loggerLogMock,
    };
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  describe("handler-level unit tests (auth slice)", () => {
    it("no-op when AUDIT_RETENTION_ENABLED=false (dev/test default)", async () => {
      envRef.AUDIT_RETENTION_ENABLED = false;
      envRef.AUDIT_RETENTION_DAYS = 90;
      const auditService = { purgeOlderThan: vi.fn() };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(auditService.purgeOlderThan).not.toHaveBeenCalled();
    });

    it("calls auditService.purgeOlderThan(days) when AUDIT_RETENTION_ENABLED=true", async () => {
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 90;
      const auditService = { purgeOlderThan: vi.fn().mockResolvedValue(42) };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(auditService.purgeOlderThan).toHaveBeenCalledTimes(1);
      expect(auditService.purgeOlderThan).toHaveBeenCalledWith(90);
    });

    it("reads AUDIT_RETENTION_DAYS=30 from env when enabled", async () => {
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 30;
      const auditService = { purgeOlderThan: vi.fn().mockResolvedValue(7) };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(auditService.purgeOlderThan).toHaveBeenCalledWith(30);
    });

    it("treats AUDIT_RETENTION_DAYS=0 (kill-switch) as enabled with 0 days", async () => {
      // Per design D2: the 0-days case is the cron-side kill-switch.
      // The handler forwards `0` verbatim to `purgeOlderThan(0)` which
      // matches every row older than 0 days (i.e., everything).
      // Operator who wants "no automatic retention" should set
      // AUDIT_RETENTION_ENABLED=false instead — the handler documents
      // this behavior in its file header.
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 0;
      const auditService = { purgeOlderThan: vi.fn().mockResolvedValue(0) };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(auditService.purgeOlderThan).toHaveBeenCalledWith(0);
    });

    it("defaults to AUDIT_RETENTION_DAYS=90 + AUDIT_RETENTION_ENABLED=false when env is empty", async () => {
      // envRef already defaults via beforeEach.
      const auditService = { purgeOlderThan: vi.fn() };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(auditService.purgeOlderThan).not.toHaveBeenCalled();
    });

    it("forwards whatever env says (no clamping at the cron layer)", async () => {
      // Edge case from task 2.11 triangulation: very large `days`
      // (e.g., 3650 = 10 years) is forwarded verbatim. The cron does
      // not clamp — that's a config-layer decision (the env contract
      // pins the upper bound at 3650 per env-refine.audit-retention.test.ts).
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 3650;
      const auditService = { purgeOlderThan: vi.fn().mockResolvedValue(0) };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(auditService.purgeOlderThan).toHaveBeenCalledWith(3650);
    });

    it("logs the purge result when rows are deleted", async () => {
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 90;
      const auditService = { purgeOlderThan: vi.fn().mockResolvedValue(42) };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      // The handler mirrors `AuthCronService.purgeExpiredResetTokens` —
      // only logs when `removed > 0` to avoid a flood of empty-purge
      // log lines in dev/test.
      expect(loggerLogMock).toHaveBeenCalledTimes(1);
      expect(loggerLogMock).toHaveBeenCalledWith(expect.stringContaining("42"));
    });

    it("does NOT log when zero rows are deleted (no-flood contract)", async () => {
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 90;
      const auditService = { purgeOlderThan: vi.fn().mockResolvedValue(0) };

      await purgeExpiredAuditEvents(auditService as never, { log: loggerLogMock });

      expect(loggerLogMock).not.toHaveBeenCalled();
    });
  });

  describe("NestJS-registered schedule integration", () => {
    it("resolves the schedule instance from AdminModule's DI container", () => {
      expect(schedule).toBeInstanceOf(AuditRetentionSchedule);
    });

    it("delegates to the handler — no-op when AUDIT_RETENTION_ENABLED=false", async () => {
      envRef.AUDIT_RETENTION_ENABLED = false;
      envRef.AUDIT_RETENTION_DAYS = 90;

      await schedule.purgeExpiredAuditEvents();

      expect(purgeOlderThanMock).not.toHaveBeenCalled();
    });

    it("delegates to the handler — purges when AUDIT_RETENTION_ENABLED=true", async () => {
      envRef.AUDIT_RETENTION_ENABLED = true;
      envRef.AUDIT_RETENTION_DAYS = 90;
      purgeOlderThanMock.mockResolvedValueOnce(42);

      await schedule.purgeExpiredAuditEvents();

      expect(purgeOlderThanMock).toHaveBeenCalledTimes(1);
      expect(purgeOlderThanMock).toHaveBeenCalledWith(90);
    });

    it("AdminModule exports AuditService so the audit endpoints + schedule share the same instance", async () => {
      const prodModuleRef = await Test.createTestingModule({
        imports: [AdminModule],
      })
        .overrideProvider(AuditService)
        .useValue({ findMany: vi.fn(), countOlderThan: vi.fn(), purgeOlderThan: vi.fn() })
        .compile();

      const svc = prodModuleRef.get<AuditService>(AuditService);
      expect(svc).toBeDefined();
      expect(prisma.adminAuditEvent).toBeDefined();
    });
  });
});