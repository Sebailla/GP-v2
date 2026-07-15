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

  // CORS — the web client at env.WEB_ORIGIN (default http://localhost:3000)
  // POSTs cross-origin to this API on :3001. Without `enableCors`, the
  // browser refuses the preflight (OPTIONS) on `Content-Type: application/json`
  // and the LoginForm / SignUpForm never reach the auth routes. The
  // `credentials: true` flag allows the NextAuth session cookie (T3.3
  // deferred) to flow when wired up.
  //
  // Slice 4 batch 4c (R1 review) — pre-existing gap. Slice 3's
  // `.env.example` documented WEB_ORIGIN as the CORS allow-list target
  // but no code wired it up. This commit closes that gap.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  // Per-request observability (R-PF-4, R-PF-5). Both run BEFORE the
  // NestJS router so every request gets an id and a structured log
  // line, including 404s and CORS preflights that never reach a
  // controller.
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

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
