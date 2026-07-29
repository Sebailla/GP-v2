import { SetMetadata } from "@nestjs/common";

/**
 * How the rate-limit guard derives the per-request bucket key.
 *
 * - `ip` (default, IP-only): the bucket key is the IP. Suitable for
 *   unauthenticated endpoints where `req.user.id` is not yet known
 *   (login, forgot-password).
 * - `ip-and-user`: the bucket key is `[ip, userId]` — the IP captures
 *   the network source, the userId (when available) captures the
 *   identity so two admins behind the same NAT share a per-IP bucket
 *   but NOT a per-actor bucket.
 * - `userId` (per-actor): the bucket key is ONLY the userId. The IP
 *   is dropped from the key. Used by `/admin/*` endpoints where the
 *   design calls for "30 req / 60 s per admin actor" — operators
 *   behind a NAT or load-balanced proxy would otherwise be capped
 *   by the IP and not by the actor identity.
 *
 * The `EMAIL_KEYED_RULES` set in `rate-limit.guard.ts` continues to
 * extend `ip-and-user` with an email segment for `auth:login` and
 * `auth:forgot`; the `keyBy` value selects the BASE key shape, and
 * the email-extended rules layer on top.
 */
export type RateLimitKeyBy = "ip" | "ip-and-user" | "userId";

export interface RateLimitRule {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly failOpen?: boolean;
  /**
   * F5 fix (4R-driven correction): how the guard derives the
   * per-request bucket key. Default `"ip"` preserves the slice-3
   * behavior for the unauthenticated `/auth/login` and
   * `/auth/forgot-password` endpoints. Set `"userId"` for
   * `/admin/*` so the bucket is per-admin-actor (not per-NAT-IP).
   */
  readonly keyBy?: RateLimitKeyBy;
}

export const RATE_LIMIT_META = "gpr:rate-limit:rule";

export const RateLimit = (rule: RateLimitRule): MethodDecorator =>
  SetMetadata(RATE_LIMIT_META, rule);
