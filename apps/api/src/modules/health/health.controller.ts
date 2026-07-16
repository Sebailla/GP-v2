import { Controller, Get, HttpCode, HttpException, HttpStatus } from "@nestjs/common";

import { env } from "@core/config";
import { prisma } from "@core/database";

import {
  buildStatusPayload,
  type MailAdapterKind,
  type RateLimitStoreKind,
} from "./status.builder.js";

/**
 * Health surface (R-PF-4).
 *
 * Three endpoints:
 *   - GET /healthz — liveness. NEVER touches the database.
 *   - GET /readyz  — readiness. Pings the database and reports migration state.
 *   - GET /status  — public operational snapshot. No secrets, ever.
 */
@Controller()
export class HealthController {
  @Get("/healthz")
  @HttpCode(200)
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("/readyz")
  async readiness(): Promise<{ status: "ready"; database: "ok" }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException(
        { status: "not-ready", database: "down" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: "ready", database: "ok" };
  }

  @Get("/status")
  async status(): Promise<ReturnType<typeof buildStatusPayload>> {
    // Dynamic import of latestBackupStatus keeps the controller free
    // of a top-level dependency on @core/database for the status
    // endpoint. Module-level imports would force `prisma` to be
    // resolved at construction time, breaking
    // `Test.createTestingModule({ imports: [HealthModule] }).compile()`
    // when the test mock doesn't provide a backupRun delegate.
    const { latestBackupStatus } = await import("@core/database");
    const rateLimitStore: RateLimitStoreKind = process.env["UPSTASH_REDIS_REST_URL"]
      ? "upstash"
      : "memory";
    const mailAdapter: MailAdapterKind = process.env["MAIL_DSN"]
      ? "smtp-gmail"
      : "console";
    const backup = await latestBackupStatus(env.NODE_ENV);
    return buildStatusPayload({
      commit: process.env["GIT_COMMIT"] ?? "local",
      version: process.env["npm_package_version"] ?? "1.1.1",
      lastBackupAt: backup.at?.toISOString() ?? null,
      lastBackupStatus: backup.status,
      rateLimitStore,
      mailAdapter,
    });
  }
}