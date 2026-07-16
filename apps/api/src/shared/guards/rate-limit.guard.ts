import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { RateLimiter } from "@core/rate-limit";

import { RATE_LIMIT_META, type RateLimitRule } from "./rate-limit.decorator.js";

export const RATE_LIMITER_TOKEN = "RATE_LIMITER";

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER_TOKEN) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(
      RATE_LIMIT_META,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (rule === undefined) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const userId = req.user?.id;
    const compositeKey = [rule.key, ip, userId].filter(Boolean).join(":");

    let decision;
    try {
      decision = await this.limiter.consume({
        key: compositeKey,
        limit: rule.limit,
        windowSeconds: rule.windowSeconds,
      });
    } catch (err) {
      this.logger.warn(
        `rate limiter error for key=${compositeKey}: ${String(err)}; failing ${rule.failOpen ? "open" : "closed"}`,
      );
      if (rule.failOpen === true) return true;
      throw new HttpException(
        { error: "RATE_LIMIT_UNAVAILABLE", message: "Rate limiter is unavailable. Try again later." },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!decision.allowed) {
      const response = ctx.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
      response.setHeader("Retry-After", String(decision.retryAfterSeconds));
      throw new HttpException(
        {
          error: "RATE_LIMITED",
          message: `Too many requests. Retry after ${decision.retryAfterSeconds}s.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
