import type { Request, Response, NextFunction } from "express";
import { createLogger, type LoggerEnv } from "@core/logging";

import { env } from "@core/config";

const logger = createLogger({
  LOG_LEVEL: env.LOG_LEVEL,
  NODE_ENV: env.NODE_ENV,
} satisfies LoggerEnv);

/**
 * Emits one structured log line per HTTP request. The latency is
 * captured via `res.on('finish')` so the value reflects the full
 * response cycle, including JSON serialization by NestJS.
 *
 * The log line shape is contract-locked by R-PF-5. The `userId` is
 * populated only when `req.user` is set by an upstream guard (the
 * JwtAuthGuard attaches the decoded token).
 */
export function requestLoggerMiddleware(
  req: Request & { id?: string; user?: { id?: string } },
  res: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const latencyNs = Number(process.hrtime.bigint() - startedAt);
    const latencyMs = Math.round(latencyNs / 1_000_000);
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        latencyMs,
        requestId: req.id,
        userId: req.user?.id,
        userAgent: req.header("user-agent") ?? "",
      },
      "http.request",
    );
  });
  next();
}
