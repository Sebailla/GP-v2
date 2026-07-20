import { Module } from "@nestjs/common";

import { createInMemoryDispatcher } from "@core/events";
import { prisma as defaultPrisma } from "@core/database";
import { InMemoryRateLimiter, UpstashRateLimiter, type RateLimiter } from "@core/rate-limit";

import { RbacService, SessionService, AuditService } from "@features/auth";

import { AdminController } from "./admin.controller.js";
import { AdminGuard } from "../../shared/guards/admin.guard.js";
import { RateLimitGuard, RATE_LIMITER_TOKEN } from "../../shared/guards/rate-limit.guard.js";

/**
 * AdminModule — M3 (module-3-superadmin) task 3.8 GREEN + F5 fix.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §4 the module
 * wires the admin-side service primitives (`RbacService` +
 * `SessionService`) into the DI container so `AdminController` can
 * be constructed with the canonical services. The dispatcher is
 * the SAME in-memory instance the `AuthModule` constructs (the
 * module-scoped closure pattern from `AuthModule`); subscribers
 * must see every dispatch the services emit, so a second copy
 * would lose events.
 *
 * AdminGuard is a singleton across the application — the kill-switch
 * (`env.ADMIN_ENABLED`) is read once at construction time and the
 * module-scoped provider is reused for every request. AuthModule
 * already exports AdminGuard in case future slices need to apply
 * the guard to non-admin controllers (none today — AdminGuard is
 * strictly an `/admin/*` surface guard per D1).
 *
 * F5 fix (4R-driven correction): RateLimitGuard is registered as a
 * provider so the `@UseGuards(JwtAuthGuard, AdminGuard,
 * RateLimitGuard)` chain in `AdminController` resolves. The guard
 * applies the per-actor (30 req / 60 s) bucket keyed on
 * `req.user.id` (the `keyBy: "userId"` mode of
 * `@RateLimit(ADMIN_RATE_LIMIT)`).
 *
 * `RbacService` is provided as a factory because the dispatcher is
 * taken as the 1st constructor argument (Pattern A — canonical
 * design §4.1). Same wiring as `AuthModule`.
 */
const dispatcher = createInMemoryDispatcher();

@Module({
  controllers: [AdminController],
  providers: [
    {
      provide: RbacService,
      useFactory: () => new RbacService(dispatcher.dispatch),
    },
    {
      provide: SessionService,
      useFactory: () =>
        new SessionService(
          defaultPrisma,
          undefined,
          undefined,
          dispatcher.dispatch,
        ),
    },
    {
      // M4 (module-4-privacy) — AuditService is the read/write
      // primitive layer for `AdminAuditEvent` (D3 + D4). Wired as a
      // factory because the service's constructor takes an optional
      // prisma-shaped dependency (defaulting to the workspace
      // singleton — see `audit.service.ts`).
      provide: AuditService,
      useFactory: () => new AuditService(defaultPrisma),
    },
    {
      provide: RATE_LIMITER_TOKEN,
      useFactory: (): RateLimiter => {
        const url = process.env["UPSTASH_REDIS_REST_URL"];
        const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
        if (typeof url === "string" && typeof token === "string" && url.length > 0 && token.length > 0) {
          return new UpstashRateLimiter(url, token);
        }
        return new InMemoryRateLimiter();
      },
    },
    AdminGuard,
    RateLimitGuard,
  ],
  exports: [AdminGuard, RateLimitGuard, RATE_LIMITER_TOKEN, RbacService, SessionService, AuditService],
})
export class AdminModule {}
