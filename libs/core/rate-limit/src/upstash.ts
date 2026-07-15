import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { RateLimitDecision, RateLimitRequest, RateLimiter } from "./types.js";

/**
 * Upstash Redis-backed rate limiter. Returns `allowed: false` when the
 * Upstash call fails (fail-closed default for auth endpoints; the
 * controller can override with a fail-open flag in T1.6).
 *
 * GOTCHA (resolved during T1.5 execution): `@upstash/ratelimit` v2.x
 * differs from the v1 API used in the original plan. In v2:
 *   - The window period is configured ONCE at construction time via
 *     `Ratelimit.slidingWindow(N, "X s")`. The `limit()` method no
 *     longer accepts a `period` field on its options bag — it only
 *     accepts `geo`, `rate`, `ip`, `userAgent`, `country`.
 *   - `limit(identifier, { rate })` overrides the per-call token
 *     consumption rate. We pass `req.limit` so the burst limit
 *     matches what the InMemory adapter reports.
 * The public `RateLimiter` interface is unchanged; only the internal
 * Upstash call adapts.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;

  constructor(url: string, token: string) {
    const redis = new Redis({ url, token });
    this.ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 s"),
      analytics: false,
      prefix: "gpr:rl",
    });
  }

  async consume(req: RateLimitRequest): Promise<RateLimitDecision> {
    const limit = await this.ratelimit.limit(req.key, { rate: req.limit });
    return {
      allowed: limit.success,
      remaining: limit.remaining,
      retryAfterSeconds: Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000)),
    };
  }
}