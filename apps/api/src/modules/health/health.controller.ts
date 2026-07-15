import { Controller, Get, HttpCode, HttpException, HttpStatus } from "@nestjs/common";

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
    // For Module 1, the backup status is sourced from a table that
    // will be added by T1.8 (Postgres row). Until then, default to
    // "never" and let T1.8 wire the real read.
    const rateLimitStore: RateLimitStoreKind = process.env["UPSTASH_REDIS_REST_URL"]
      ? "upstash"
      : "memory";
    const mailAdapter: MailAdapterKind = process.env["MAIL_DSN"]
      ? "smtp-gmail"
      : "console";
    return buildStatusPayload({
      commit: process.env["GIT_COMMIT"] ?? "local",
      version: process.env["npm_package_version"] ?? "1.1.1",
      lastBackupAt: null,
      lastBackupStatus: "never",
      rateLimitStore,
      mailAdapter,
    });
  }
}