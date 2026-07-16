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
import type { ZodTypeAny } from "zod";

import { RateLimiter } from "@core/rate-limit";
import { rateLimitBlockedTotal } from "../../modules/metrics/registry.js";
import {
  forgotPasswordSchema,
  loginSchema,
} from "@features/auth";

import { RATE_LIMIT_META, type RateLimitRule } from "./rate-limit.decorator.js";

export const RATE_LIMITER_TOKEN = "RATE_LIMITER";

/**
 * Per R-PF-8 (spec §4.2.3), the rate-limit key for `POST /auth/login`
 * and `POST /auth/forgot-password` MUST include the `email` segment in
 * addition to the IP, so a single attacker IP cannot exhaust the bucket
 * for unrelated users (and so a legitimate user cannot be locked out by
 * another tenant on the same NAT). For all other rules the key remains
 * the IP-only form.
 */
const EMAIL_KEYED_RULES = new Set<string>(["auth:login", "auth:forgot"]);

const EMAIL_SCHEMAS: Record<string, ZodTypeAny> = {
  "auth:login": loginSchema,
  "auth:forgot": forgotPasswordSchema,
};

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

    const emailSegment = this.extractEmailSegment(rule, req.body);
    const compositeKey = [rule.key, ip, userId, emailSegment]
      .filter((segment) => segment !== undefined && segment !== null && segment !== "")
      .join(":");

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
      rateLimitBlockedTotal.inc({ endpoint: rule.key });
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

  /**
   * Parse the request body against the canonical Zod schema for the
   * given rule and return the `email` field, if any. Returns
   * `undefined` when the rule does not key on email, when the body is
   * missing, or when the body fails validation — the controller's own
   * `validateOrThrow` will reject malformed bodies with a 400.
   */
  private extractEmailSegment(rule: RateLimitRule, body: unknown): string | undefined {
    if (!EMAIL_KEYED_RULES.has(rule.key)) return undefined;
    const schema = EMAIL_SCHEMAS[rule.key];
    if (schema === undefined) return undefined;
    const result = schema.safeParse(body);
    if (!result.success) return undefined;
    const parsed = result.data as { email?: unknown };
    if (typeof parsed.email !== "string" || parsed.email.length === 0) return undefined;
    return parsed.email;
  }
}
