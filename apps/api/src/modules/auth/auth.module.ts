import { Module } from "@nestjs/common";

import {
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
  PrismaPasswordResetTokenRepository,
  PrismaSessionRepository,
  PrismaUserRepository,
  defaultAuditSink,
} from "@features/auth";

import { createInMemoryDispatcher } from "@core/events";
import { prisma as defaultPrisma } from "@core/database";
import { InMemoryRateLimiter, UpstashRateLimiter, type RateLimiter } from "@core/rate-limit";

import { AuthController } from "./auth.controller.js";
import { AuthCronService } from "./auth-cron.service.js";
import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";
import { RateLimitGuard, RATE_LIMITER_TOKEN } from "../../shared/guards/rate-limit.guard.js";

/**
 * AuthModule (slice 3 batch 6 — T3.6 NestJS thin wrapper).
 *
 * Per design §2 the module is the DI composition root for the auth
 * slice. All business code lives in the auth services exported by
 * `@features/auth`. The module:
 *  1. Constructs the canonical services with the workspace ports +
 *     default prisma singleton + the in-memory dispatcher (slice 3
 *     ships in-memory; slice 4+ swaps for a real broker).
 *  2. Provides the JwtAuthGuard (slice 3 stub — T3.3 swaps for the
 *     NextAuth v5 adapter).
 *  3. Registers AuthController (the 6 design-§4.1 routes).
 *  4. Registers AuthCronService (F4 — every 15 min, prune expired
 *     password-reset tokens).
 *
 * Providers are factory functions rather than value providers because
 * the services have non-trivial constructor arguments (the dispatcher
 * closure, the prisma singleton, the default audit sink). Factories
 * preserve the wiring without forcing the services to adopt
 * `@Injectable()`-style paramtypes metadata.
 */
const dispatcher = createInMemoryDispatcher();

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AuthService,
      useFactory: () => new AuthService(),
    },
    {
      provide: SessionService,
      useFactory: () =>
        new SessionService(
          defaultPrisma,
          new PrismaSessionRepository(defaultPrisma),
          new PrismaUserRepository(defaultPrisma),
          dispatcher.dispatch,
        ),
    },
    {
      provide: PasswordResetService,
      useFactory: () =>
        new PasswordResetService(
          new PrismaUserRepository(defaultPrisma),
          new PrismaPasswordResetTokenRepository(defaultPrisma),
          dispatcher.dispatch,
          defaultPrisma,
          defaultAuditSink,
        ),
    },
    {
      provide: RbacService,
      useFactory: () => new RbacService(dispatcher.dispatch),
    },
    {
      provide: AuthCronService,
      useFactory: () => new AuthCronService(new PrismaPasswordResetTokenRepository(defaultPrisma)),
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
    JwtAuthGuard,
    RateLimitGuard,
  ],
  exports: [
    AuthService,
    SessionService,
    RbacService,
    PasswordResetService,
    AuthCronService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
