import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";

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