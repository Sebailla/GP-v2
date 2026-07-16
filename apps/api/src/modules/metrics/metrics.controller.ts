import {
  Controller,
  Get,
  Header,
  HttpCode,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { env } from "@core/config";

import { metricsRegistry } from "./registry.js";

@Controller("/metrics")
export class MetricsController {
  @Get()
  @HttpCode(200)
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics(@Req() req: Request): Promise<string> {
    const supplied = extractBearer(req);
    if (supplied !== env.METRICS_TOKEN) {
      throw new UnauthorizedException("metrics token required");
    }
    return metricsRegistry.metrics();
  }
}

function extractBearer(req: Request): string | null {
  const auth = req.header("authorization");
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  const token = req.header("x-metrics-token");
  return typeof token === "string" ? token.trim() : null;
}
