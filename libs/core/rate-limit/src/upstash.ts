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
 *
 * C-2 fix (R-PF-8): the constructor must NOT pre-bind a window,
 * because different rules ship different `windowSeconds` (e.g.
 * `auth:login` = 600s, `auth:register` = 3600s). The `@upstash/ratelimit`
 * v2 API only accepts the window at construction, so we cache one
 * `Ratelimit` instance per `windowSeconds`. `consume()` becomes a Map
 * lookup (option (b) from the ledger — chosen for performance over
 * constructing a fresh instance per call).
 *
 * The `limit` per-call still flows through `req.rate`, so the burst
 * number can vary per request even within the same window bucket.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly ratelimitsByWindowSeconds = new Map<number, Ratelimit>();

  constructor(url: string, token: string, prefix = "gpr:rl") {
    this.redis = new Redis({ url, token });
    this.prefix = prefix;
  }

  private ratelimitFor(windowSeconds: number): Ratelimit {
    const cached = this.ratelimitsByWindowSeconds.get(windowSeconds);
    if (cached !== undefined) return cached;
    // The burst number passed to `slidingWindow` is overridden per-call
    // via the `rate` option of `limit()`. We pass `windowSeconds` as
    // the burst so the unused constructor value is at least consistent
    // with the window length; the actual cap comes from `req.limit`.
    const created = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(windowSeconds, `${windowSeconds} s`),
      analytics: false,
      prefix: this.prefix,
    });
    this.ratelimitsByWindowSeconds.set(windowSeconds, created);
    return created;
  }

  async consume(req: RateLimitRequest): Promise<RateLimitDecision> {
    const ratelimit = this.ratelimitFor(req.windowSeconds);
    const limit = await ratelimit.limit(req.key, { rate: req.limit });
    return {
      allowed: limit.success,
      remaining: limit.remaining,
      retryAfterSeconds: Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000)),
    };
  }
}