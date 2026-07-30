import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Extracts the authenticated user's id from the request.
 *
 * The `JwtAuthGuard` (from @features/auth) populates `request.user.id`
 * before any controller handler runs. This decorator reads that field
 * and exposes it as a typed parameter to controller methods.
 *
 * Usage:
 *   @Get('summary')
 *   async getSummary(@UserId() userId: string, @Query() q: ReportQueryDto) {
 *     return this.reports.getSummary(userId, q);
 *   }
 *
 * If the guard is misconfigured and `request.user.id` is missing, the
 * decorator returns an empty string and the controller should fail
 * fast on the empty userId (typically via a NOT NULL constraint or a
 * filter that returns zero rows). We do NOT throw here because the
 * guard contract is the canonical "fail closed" point — controllers
 * should trust that any request reaching them has a userId.
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id ?? '';
  },
);
