import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { PasswordResetTokenRepository } from "@features/auth";

/**
 * F4 cron registration (slice 3 batch 6 — T3.6 NestJS wrapper).
 *
 * Per the 4R review of PR #8 (slice 3 batch 5) the `deleteExpired`
 * port method on `PasswordResetTokenRepository` was added in batch
 * 5 but no caller existed. The cron is the natural caller. It runs
 * every 15 minutes (per design §11's default for the reference repo)
 * and removes every unconsumed `PasswordResetToken` whose
 * `expiresAt` is in the past.
 *
 * The cron takes the port (not the Prisma adapter directly) so a
 * future slice that swaps the Prisma adapter for a different storage
 * (e.g. a TTL key in Redis for hot rows) can drop the adapter in
 * without touching this service.
 */
@Injectable()
export class AuthCronService {
  private readonly logger = new Logger(AuthCronService.name);

  constructor(private readonly passwordResetTokenRepo: PasswordResetTokenRepository) {}

  @Cron("*/15 * * * *")
  async purgeExpiredResetTokens(): Promise<void> {
    const before = new Date();
    const removed = await this.passwordResetTokenRepo.deleteExpired(before);
    if (removed > 0) {
      this.logger.log(
        `purged ${removed} expired password-reset token(s) (expiresAt < ${before.toISOString()})`,
      );
    }
  }
}
