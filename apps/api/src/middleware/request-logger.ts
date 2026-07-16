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
/**
 * Bucket a request path for low-cardinality Prometheus labels. Unmatched
 * routes (404s) collapse to a single label so a scanner hammering
 * /wp-admin.php, /.env, etc. cannot blow up Prometheus memory. The
 * raw URL is still preserved in the structured log line — metrics
 * labels are aggregate, logs are per-request.
 */
function bucketPath(req: Request): string {
  const matched = req.route?.path as string | undefined;
  if (matched !== undefined) return matched;
  return "unmatched";
}

export function requestLoggerMiddleware(
  req: Request & { id?: string; user?: { id?: string } },
  res: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const latencyNs = Number(process.hrtime.bigint() - startedAt);
    const latencyMs = Math.round(latencyNs / 1_000_000);
    const metricPath = bucketPath(req);
    const labels = { method: req.method, path: metricPath, status: String(res.statusCode) };
    void import("../modules/metrics/registry.js").then(({ httpRequestsTotal, httpErrors5xxTotal, httpRequestDurationSeconds }) => {
      httpRequestsTotal.inc(labels);
      if (res.statusCode >= 500) httpErrors5xxTotal.inc({ method: req.method, path: metricPath });
      httpRequestDurationSeconds.observe({ method: req.method, path: metricPath }, latencyNs / 1_000_000_000);
    });
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
