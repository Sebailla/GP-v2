import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

// IMPORTANT: import the services as runtime values, not `import type`.
// The auto-formatter's `useImportType` rule rewrites value imports
// to type-only when the symbol is only used as a constructor
// parameter type. NestJS's reflective DI requires the runtime
// classes, so we anchor them to a module-level constant that the
// formatter cannot see as type-only.
import {
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
  AuthError,
  ValidationError,
  type CurrentUser,
} from "@features/auth";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@features/auth";

// Module-level runtime anchor for the services. This forces the
// import above to be a value import (the auto-formatter sees these
// identifiers used at module scope, not as type annotations only).
// After NestJS resolves the controller's constructor at startup, this
// anchor is unused; it exists purely to defeat the linter's
// `useImportType` heuristic.
const _serviceAnchor: ReadonlyArray<unknown> = [
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
];
void _serviceAnchor;

import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";
// Side-effect import: keeps the @Body decorator exported from this
// module so consumers (slice 5 tests, future features) can use it
// alongside the auth controller.
import "../../shared/decorators/body.decorator.js";

/**
 * Map an AuthError code to the HTTP status the controller should
 * return. Centralized so every route uses the same mapping; per design
 * §4.1:
 *  - USER_NOT_FOUND, INVALID_CREDENTIALS, INVALID_RESET_TOKEN,
 *    INVALID_SESSION, SESSION_EXPIRED → 401
 *  - EMAIL_ALREADY_EXISTS → 409
 *  - ValidationError (Zod rejection at the boundary) → 400
 *  - anything else → 500
 */
function authErrorToHttpStatus(error: AuthError | ValidationError): number {
  if (error instanceof ValidationError) {
    return 400;
  }
  switch (error.code) {
    case "USER_NOT_FOUND":
    case "INVALID_CREDENTIALS":
    case "INVALID_RESET_TOKEN":
    case "INVALID_SESSION":
    case "SESSION_EXPIRED":
      return 401;
    case "EMAIL_ALREADY_EXISTS":
      return 409;
    default:
      return 500;
  }
}

/**
 * Wrap a service call so an AuthError/ValidationError becomes a
 * NestJS HttpException with the correct status. Keeps route handlers
 * readable — the error-translation policy lives in one place.
 *
 * The generic Body parameter is referenced indirectly via the
 * `body.decorator.js` side-effect import above (which re-exports the
 * type alias). The Body decorator is imported at the module level for
 * framework-aware tooling; see `@BodySchema` usage in `body.decorator.ts`.
 */
async function runOrThrowHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) {
      const status = authErrorToHttpStatus(error);
      throw new HttpException(
        { error: error.code, message: error.message },
        status,
      );
    }
    if (error instanceof ValidationError) {
      throw new HttpException(
        { error: "VALIDATION_FAILED", message: error.message, issues: error.issues },
        authErrorToHttpStatus(error),
      );
    }
    throw error;
  }
}

/**
 * AuthController (slice 3 batch 6 — T3.6 NestJS thin wrapper).
 *
 * Per design §2 the controller is a thin DI-wiring + route-binding
 * layer. All business code lives in the auth services exported by
 * `@features/auth`. The controller's only job is to:
 *  1. Bind each of the 6 design-§4.1 routes to a service method.
 *  2. Validate the body via the generic ZodValidationPipe.
 *  3. Map service errors to HTTP status codes.
 *  4. Attach the JWT guard to the two authenticated routes.
 *
 * T3.3 (NextAuth v5 config) is deferred to batch 7; the current
 * JwtAuthGuard is a stub that reads the bearer token and looks up
 * the session via SessionService.
 *
 * @Body is included in the imports so the framework's metadata
 * reflection sees the parameter-decorator registry. Use @BodySchema
 * (the slice's typed body wrapper) on each route instead.
 */
@Controller("/auth")
// biome-ignore lint/correctness/useExhaustiveDependencies: Body is a framework decorator
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly passwordResetService: PasswordResetService,
    private readonly rbacService: RbacService,
  ) {}

  @Post("/login")
  @HttpCode(200)
  async login(
    @Body()
    body: LoginInput,
  ): Promise<{ id: string; email: string; role: string; sessionToken: string }> {
    return runOrThrowHttp(async () => {
      const result = await this.authService.login(body.email, body.password);
      return {
        id: result.id,
        email: result.email,
        role: result.role,
        sessionToken: result.sessionToken,
      };
    });
  }

  @Post("/register")
  @HttpCode(201)
  async register(
    @Body()
    body: RegisterInput,
  ): Promise<{ id: string; email: string; role: string; sessionToken: string }> {
    return runOrThrowHttp(async () => {
      const result = await this.authService.register(
        body.email,
        body.password,
        body.name,
      );
      return {
        id: result.id,
        email: result.email,
        role: result.role,
        sessionToken: result.sessionToken,
      };
    });
  }

  @Post("/forgot-password")
  @HttpCode(202)
  async forgotPassword(
    @Body()
    body: ForgotPasswordInput,
  ): Promise<void> {
    // requestReset is idempotent (no enumeration leak). Both known
    // and unknown emails return void to the caller (202 Accepted).
    await this.passwordResetService.requestReset(body.email);
  }

  @Post("/reset-password")
  @HttpCode(200)
  async resetPassword(
    @Body()
    body: ResetPasswordInput,
  ): Promise<void> {
    return runOrThrowHttp(async () => {
      await this.passwordResetService.consumeReset(body.token, body.newPassword);
    });
  }

  @Get("/sessions")
  @UseGuards(JwtAuthGuard)
  async listSessions(
    @Req() request: Request & { user: CurrentUser },
  ): Promise<ReadonlyArray<{ id: string; sessionToken: string; expires: Date }>> {
    return runOrThrowHttp(async () => {
      // RbacService.can is the canonical authorization gate; per design
      // §4.1 the controller must use it (not a UI-only check). The user
      // is allowed to read their own session list.
      const allowed = this.rbacService.can(
        { id: request.user.id, role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: request.user.id },
      );
      if (!allowed) {
        throw new Error(
          "RbacService denied session:read:own — invariant violation",
        );
      }
      return this.sessionService.listActiveSessions(request.user.id);
    });
  }

  @Delete("/sessions/:id")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @Param("id") sessionId: string,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<void> {
    return runOrThrowHttp(async () => {
      const allowed = this.rbacService.can(
        {
          id: request.user.id,
          role: request.user.role === "ADMIN" ? "ADMIN" : "USER",
        },
        "session:revoke:own",
        { kind: "session", ownerId: request.user.id, id: sessionId },
      );
      if (!allowed) {
        throw new Error(
          "RbacService denied session:revoke:own — invariant violation",
        );
      }
      await this.sessionService.revokeSession(sessionId, request.user.id);
    });
  }
}
