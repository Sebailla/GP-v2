import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { env } from "@core/config";

import type { CurrentUser } from "@features/auth";

/**
 * AdminGuard — M3 (module-3-superadmin) task 3.4 GREEN.
 *
 * Server-side authority check for the `/admin/*` route group. Composed
 * behind `JwtAuthGuard` via `@UseGuards(JwtAuthGuard, AdminGuard)` so
 * `request.user` is populated by the time this guard runs (see
 * `apps/api/src/shared/guards/jwt.guard.ts` for the decode + projection
 * pipeline — it reads the bearer JWT, decodes it via
 * `next-auth/jwt#decode` (try/catch per
 * `pattern/nextauth-decode-try-catch`), and projects the claims onto
 * `request.user: CurrentUser = { id, email, role }`).
 *
 * Behavior (per `openspec/changes/module-3-superadmin/design.md` D1 +
 * threat matrix §7 Routing row):
 *
 *   1. `env.ADMIN_ENABLED === false` → throw 404 NotFoundException.
 *      The kill-switch hides the entire admin surface from clients
 *      (an attacker cannot enumerate endpoints — they all collapse to
 *      404). Default in `env.schema.ts` is `true`.
 *   2. `request.user` missing OR `request.user.id` falsy → throw 401.
 *      Defensive branch: in production JwtAuthGuard runs first, so
 *      `req.user` is guaranteed. The unit test forces this branch to
 *      pin the contract.
 *   3. `request.user.role !== "ADMIN"` → throw 403. Generic copy —
 *      no leak about which role/claim failed.
 *   4. Otherwise resolve `true`.
 *
 * The guard does NOT call into RbacService / SessionService — those
 * checks belong to the controller handlers. The guard's sole
 * responsibility is the role assertion + the kill-switch toggle.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Kill-switch check (design §2 D1, §7 Configuration row): when
    // operators flip `ADMIN_ENABLED=false`, every `/admin/*` route
    // collapses to 404. The check runs FIRST so a forged token with
    // `role: "ADMIN"` still 404s — the kill-switch wins over the role
    // check.
    if (env.ADMIN_ENABLED === false) {
      throw new NotFoundException("admin surface is disabled");
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUser }>();
    const user = request.user;

    if (user === undefined || user === null || user.id === undefined || user.id === "") {
      // JwtAuthGuard should have populated `req.user` already; this
      // branch is defensive (test isolation, future swap to a different
      // auth guard, etc.).
      throw new UnauthorizedException("authentication required");
    }

    if (user.role !== "ADMIN") {
      throw new ForbiddenException("admin role required");
    }

    return true;
  }
}
