import "reflect-metadata";

import { env } from "@core/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.js";

// Validate env at process boot. Any missing or malformed variable
// throws a ZodError listing every offending field before NestJS
// starts listening.
void env;

/**
 * Bootstrap NestJS on the configured port (default 3001).
 * Slice 1 ships an empty AppModule - the only purpose of this entry
 * point is to verify the container can boot, log a recognizable
 * line, and shut down cleanly on SIGTERM.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["log", "error", "warn"],
  });

  // CORS — the web client at env.PUBLIC_WEB_URL (default
  // http://localhost:3000) POSTs cross-origin to this API on :3001.
  // Without `enableCors`, the browser refuses the preflight (OPTIONS)
  // on `Content-Type: application/json` and the LoginForm / SignUpForm
  // never reach the auth routes. The `credentials: true` flag allows
  // the NextAuth session cookie (T3.3 deferred) to be wired up.
  //
  // Slice 4 batch 4c (R1 review) — pre-existing gap closed with
  // `env.WEB_ORIGIN`. R-PF-2 (production-foundation change) tightens
  // the allow-list to the deployment-public URL (`env.PUBLIC_WEB_URL`)
  // and pins the methods + allowedHeaders so preflights from
  // misconfigured clients are rejected explicitly. The pre-existing
  // `env.WEB_ORIGIN` is kept as a backward-compat fallback at the env
  // schema level; the API now binds the response to the deployment-
  // canonical origin.
  app.enableCors({
    origin: env.PUBLIC_WEB_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Metrics-Token",
      "Idempotency-Key",
    ],
  });

  // Per-request observability (R-PF-4, R-PF-5). Both run BEFORE the
  // NestJS router so every request gets an id and a structured log
  // line, including 404s and CORS preflights that never reach a
  // controller.
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // R-PF-8: without `trust proxy` Express returns the immediate socket
  // address in `req.ip` (Fly.io's internal IP). With the reverse-proxy
  // chain Fly → Vercel, every request looks like it came from the
  // proxy, collapsing the per-IP rate-limit buckets into one global
  // bucket. Trust the first hop (the load balancer / CDN in front of
  // Fly) so `req.ip` resolves to the real client IP. Override via the
  // `TRUST_PROXY_HOPS` env var when the deployment adds more proxies.
  const trustProxyHops = Number.parseInt(process.env["TRUST_PROXY_HOPS"] ?? "1", 10);
  app.set("trust proxy", Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : 1);

  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  await app.listen(port);

  console.log(`Nest application successfully started on :${port}`);

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
