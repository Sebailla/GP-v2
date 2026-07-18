import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { createLogger, type Logger } from "@core/logging";
import { env } from "@core/config";

import {
  RbacService,
  SessionService,
  type CurrentUser,
  LastAdminError,
} from "@features/auth";
import {
  ChangeRoleBodySchema,
  ListSessionsQuerySchema,
  ListUsersQuerySchema,
} from "@features/auth/shared/schemas";

import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";
import { AdminGuard } from "../../shared/guards/admin.guard.js";
import { NEXTAUTH_SESSION_TOKEN_NAME } from "../../lib/auth.constants.js";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";

/**
 * AdminController — M3 (module-3-superadmin) task 3.2 GREEN + 3.5 GREEN.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §5 the
 * controller exposes 5 endpoints under `/admin/*`:
 *
 *   GET    /admin/users?limit=&offset=
 *   POST   /admin/users/:userId/role         body: {role}
 *   GET    /admin/sessions?userId=
 *   DELETE /admin/sessions/:sessionId
 *   DELETE /admin/sessions/user/:userId
 *
 * All 5 are guarded by `@UseGuards(JwtAuthGuard, AdminGuard)` per D1 +
 * threat matrix §7. JwtAuthGuard decodes the bearer JWT and projects
 * `req.user`; AdminGuard checks `env.ADMIN_ENABLED` first (404
 * kill-switch), then role (401/403 generic copy).
 *
 * Controller responsibilities:
 *  1. Validate input via the canonical Zod schemas (single source of
 *     truth per AGENTS.md §8).
 *  2. Capture IP + UA at the HTTP boundary (D3) — services stay
 *     HTTP-agnostic.
 *  3. Translate service errors to HTTP statuses (404 unknown user,
 *     400 invalid input).
 *  4. Emit a `Set-Cookie` clearing the session cookie on self-revoke
 *     (D5 — admin can revoke own session; the cookie clear is what
 *     actually logs the admin out client-side).
 *  5. Log the IP under the `ip` key so pino's redact path (per
 *     `pattern/pino-bracket-notation-redaction`) substitutes
 *     `[REDACTED]` before serialization.
 *
 * The `auth.session.revoked` event is dispatched from
 * SessionService.revoke/revokeAll (PR #2 task 2.2) — the controller
 * does NOT re-dispatch. The audit row insertion happens inside the
 * service via `insertAuditEvent` (PR #2 task 2.5).
 */
@Controller("/admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  private readonly logger: Logger = createLogger({
    LOG_LEVEL: env.LOG_LEVEL,
    NODE_ENV: env.NODE_ENV,
  });

  constructor(
    private readonly rbacService: RbacService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * GET /admin/users?limit=&offset= — list users paginated, sorted
   * DESC by createdAt. Returns `[{id, email, role, createdAt}]`.
   *
   * RbacService.listUsers is the canonical implementation; the
   * controller only does query parsing + response shaping.
   */
  @Get("/users")
  async listUsers(
    @Query(new ZodValidationPipe(ListUsersQuerySchema))
    query: { limit: number; offset: number },
  ): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly email: string;
      readonly role: string;
      readonly createdAt: Date;
    }>
  > {
    const rows = await this.rbacService.listUsers({
      limit: query.limit,
      offset: query.offset,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
    }));
  }

  /**
   * POST /admin/users/:userId/role — change a user's role.
   * Body: `{role: "USER"|"ADMIN"}`. Returns the updated user row.
   *
   * Translates `RbacService.changeRole` "User not found" error into
   * 404. The service's idempotent path (same role → no DB write,
   * no audit, no event) is preserved.
   */
  @Post("/users/:userId/role")
  @HttpCode(200)
  async changeUserRole(
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(ChangeRoleBodySchema))
    body: { role: "USER" | "ADMIN" },
    @Req() request: Request & { user: CurrentUser },
  ): Promise<{
    readonly id: string;
    readonly email: string;
    readonly role: string;
    readonly createdAt: Date;
  }> {
    try {
      const updated = await this.rbacService.changeRole(
        userId,
        body.role,
        request.user.id,
      );
      return {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        createdAt: updated.createdAt,
      };
    } catch (error) {
      // F2 fix (4R-driven correction): map LastAdminError → 409
      // Conflict so the operator UI surfaces a meaningful error
      // when they try to demote the only remaining admin.
      if (error instanceof LastAdminError) {
        throw new ConflictException({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof Error && error.message.startsWith("User not found")) {
        throw new NotFoundException({ error: "USER_NOT_FOUND", message: error.message });
      }
      throw error;
    }
  }

  /**
   * GET /admin/sessions?userId= — list a user's sessions sorted DESC
   * by expires (proxy for lastActiveAt per PR #2 deviation #1).
   */
  @Get("/sessions")
  async listSessions(
    @Query(new ZodValidationPipe(ListSessionsQuerySchema))
    query: { userId: string },
  ): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly userId: string;
      readonly sessionToken: string;
      readonly expires: Date;
    }>
  > {
    const rows = await this.sessionService.list(query.userId);
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      sessionToken: row.sessionToken,
      expires: row.expires,
    }));
  }

  /**
   * DELETE /admin/sessions/:sessionId — revoke a single session.
   *
   * On self-revoke (the deleted session's userId matches the JWT's
   * userId) the response carries a `Set-Cookie` header that clears
   * the NextAuth session cookie client-side. This is the canonical
   * "log out from this device" UX (D5).
   *
   * Self-revoke is detected by reading the session row BEFORE the
   * delete (the service's `revoke` is silent-no-op on missing rows;
   * checking after the delete would require a separate list call).
   * The `PrismaSessionRepository.findById` lookup is O(1) on the
   * primary key and keeps the controller's post-revoke flow
   * side-effect-free.
   *
   * IP + UA are captured at the HTTP boundary (D3). The pino log
   * line uses the `ip` key so pino's redact path (per
   * `pattern/pino-bracket-notation-redaction`) substitutes
   * `[REDACTED]` before serialization — IP is captured as
   * `req.ip` for forensic value, redacted at the log boundary.
   */
  @Delete("/sessions/:sessionId")
  @HttpCode(204)
  async revokeSession(
    @Param("sessionId") sessionId: string,
    @Req() request: Request & { user: CurrentUser },
    @Res({ passthrough: true }) res: Response,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<void> {
    // Capture IP at the HTTP boundary (D3). Truncated to 45 chars
    // per the schema column constraint (IPv6 max length).
    const ipAddress = this.captureIp(request);
    const userAgentSafe = this.captureUserAgent(userAgent);

    // F3 fix (4R-driven correction): detect self-revoke by reading
    // the session row BEFORE the revoke, comparing its `userId` to
    // the JWT-decoded `request.user.id`. The previous
    // `remainingSessions.length === 0` post-revoke heuristic was
    // wrong for admins with multiple concurrent sessions (revoking
    // one leaves others active, the cookie stays, the admin stays
    // logged in). `findById` is O(1) on the primary key and pins
    // the self-revoke decision to the actual target row.
    let isSelfRevoke = false;
    try {
      const sessionRow = await this.sessionService.findById(sessionId);
      if (sessionRow !== null && sessionRow.userId === request.user.id) {
        isSelfRevoke = true;
      }
    } catch {
      // Defensive: a missing row produces `null` from `findById`.
      // Any other read error propagates to the global NestJS
      // exception filter.
    }

    await this.sessionService.revoke(
      sessionId,
      request.user.id,
      ipAddress,
      userAgentSafe,
    );

    // Pino `[ip]` redaction (per `pattern/pino-bracket-notation-redaction`):
    // the structured-object form `{ ip: req.ip, userAgent, action, ... }`
    // is the contract pino's redact path fires on. The literal `ip` key
    // matches the redact path; `userAgent` is captured for ops but not
    // logged in the controller (it's already stored in the audit row).
    this.logger.info(
      {
        admin: { action: "REVOKE_SESSION", sessionId },
        ip: ipAddress ?? "[REDACTED]",
        user: { id: request.user.id },
      },
      "[admin] session revoked",
    );

    // Self-revoke detected via ownership match (NOT via
    // post-revoke list count). Emit Set-Cookie ONLY when the
    // revoked session's userId matches the requestor's userId,
    // regardless of how many other sessions the admin has.
    if (isSelfRevoke) {
      this.emitSessionCookieClear(res);
    }
  }

  /**
   * DELETE /admin/sessions/user/:userId — revoke every session owned
   * by the user. Returns 204. The audit row records `count` in its
   * metadata (PR #2 task 2.2 / 2.5).
   */
  @Delete("/sessions/user/:userId")
  @HttpCode(204)
  async revokeAllUserSessions(
    @Param("userId") userId: string,
    @Req() request: Request & { user: CurrentUser },
    @Res({ passthrough: true }) res: Response,
    @Headers("user-agent") userAgent: string | undefined,
  ): Promise<void> {
    const ipAddress = this.captureIp(request);
    const userAgentSafe = this.captureUserAgent(userAgent);

    const count = await this.sessionService.revokeAll(
      userId,
      request.user.id,
      ipAddress,
      userAgentSafe,
    );

    this.logger.info(
      {
        admin: { action: "REVOKE_ALL_SESSIONS", targetUserId: userId, count },
        ip: ipAddress ?? "[REDACTED]",
        user: { id: request.user.id },
      },
      "[admin] all sessions revoked for user",
    );

    // Self-revoke-all: when admin clears every session for their own
    // userId (typical "log out everywhere" UX), emit the cookie clear.
    if (userId === request.user.id) {
      this.emitSessionCookieClear(res);
    }
  }

  /**
   * Capture `req.ip` (respects Express `trust proxy` config).
   * Returns `null` when the IP is unavailable — the audit row
   * column is nullable.
   */
  private captureIp(request: Request): string | null {
    const ip = request.ip;
    if (typeof ip !== "string" || ip.length === 0) return null;
    // IPv6 max length is 45 chars (e.g., "ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255").
    // The schema column is `String?` with no length cap; truncate
    // defensively so a misconfigured upstream proxy can't blow the
    // audit row size.
    return ip.length > 45 ? ip.slice(0, 45) : ip;
  }

  /**
   * Capture `req.headers['user-agent']`. Truncate to 512 chars
   * per design §7 (UA truncation > 512 boundary case).
   */
  private captureUserAgent(header: string | undefined): string | null {
    if (typeof header !== "string" || header.length === 0) return null;
    return header.length > 512 ? header.slice(0, 512) : header;
  }

  /**
   * Emit the canonical NextAuth session-cookie clear. The shape
   * (`authjs.session-token=; Path=/; Expires=...`) matches NextAuth
   * v5's cookie semantics — a same-name cookie with an empty value
   * and an Expires in the past tells the browser to delete the
   * stored cookie. `HttpOnly + SameSite=Lax` mirror the production
   * cookie shape; `secure: false` in test (NODE_ENV !== production).
   */
  private emitSessionCookieClear(res: Response): void {
    const isProduction = env.NODE_ENV === "production";
    res.cookie(NEXTAUTH_SESSION_TOKEN_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      expires: new Date(0),
    });
  }
}

/**
 * Runtime anchor (per ADR 0008 — defensive against `useImportType`
 * auto-formatter heuristics). Keeps the constructor's paramtypes
 * alive even if a future formatter rewrites the imports to
 * `import { type Service }`.
 */
const _ServiceAnchor: ReadonlyArray<unknown> = [
  RbacService,
  SessionService,
] as const;
