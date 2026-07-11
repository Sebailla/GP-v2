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

import {
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
  AuthError,
  ValidationError,
  type CurrentUser,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@features/auth";

import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";

/**
 * Map an AuthError code to the HTTP status the controller should
 * return. Centralized so every route uses the same mapping; per design
 * §4.1.
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

async function runOrThrowHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) {
      throw new HttpException(
        { error: error.code, message: error.message },
        authErrorToHttpStatus(error),
      );
    }
    if (error instanceof ValidationError) {
      throw new HttpException(
        {
          error: "VALIDATION_FAILED",
          message: error.message,
          issues: error.issues,
        },
        authErrorToHttpStatus(error),
      );
    }
    throw error;
  }
}

function validateOrThrow<T extends import("zod").ZodTypeAny>(
  raw: unknown,
  schema: T,
): import("zod").infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map((segment) =>
          typeof segment === "symbol" ? String(segment) : segment,
        ),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/**
 * AuthController (slice 3 batch 6b — T3.6 e2e fix).
 *
 * Per design §2 the controller is a thin DI-wiring + route-binding
 * layer. All business code lives in the auth services exported by
 * `@features/auth`. The controller:
 *  1. Binds each of the 6 design-§4.1 routes to a service method.
 *  2. Validates the body via the canonical Zod schemas (Pattern A:
 *     `validateOrThrow(schema)` — runs before the service is called).
 *  3. Maps service errors to HTTP status codes.
 *  4. Attaches the JWT guard to the two authenticated routes.
 *
 * T3.3 (NextAuth v5 config) is deferred to batch 7; the current
 * JwtAuthGuard is a stub that reads the bearer token and looks up
 * the session via SessionService. Real JWT verification lands later.
 *
 * AUTO-FORMATTER MITIGATION: The harness's biome auto-formatter
 * converts `import { Foo }` to `import { type Foo }` when the symbol
 * is only used as a parameter type annotation. NestJS's reflective
 * DI requires runtime class identity. We defeat the heuristic with
 * a class-level static field that references each service as a VALUE
 * (not a type). After NestJS resolves the constructor at startup, this
 * anchor is unused; it exists purely to keep the runtime import.
 */
@Controller("/auth")
export class AuthController {
  /**
   * Static runtime anchors. These force the services to be imported
   * as runtime values (the linter's `useImportType` rule preserves
   * imports when the symbol is used as a value). The anchors are
   * never accessed at runtime — they're a marker for the linter.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    PasswordResetService,
    RbacService,
    SessionService,
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly passwordResetService: PasswordResetService,
    private readonly rbacService: RbacService,
  ) {}

  @Post("/login")
  @HttpCode(200)
  async login(
    @Body() raw: unknown,
  ): Promise<{ id: string; email: string; role: string; sessionToken: string }> {
    return runOrThrowHttp(async () => {
      const body = validateOrThrow<typeof loginSchema>(raw, loginSchema);
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
    @Body() raw: unknown,
  ): Promise<{ id: string; email: string; role: string; sessionToken: string }> {
    return runOrThrowHttp(async () => {
      const body = validateOrThrow<typeof registerSchema>(raw, registerSchema);
      const result = await this.authService.register(body.email, body.password, body.name);
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
  async forgotPassword(@Body() raw: unknown): Promise<void> {
    const body = validateOrThrow<typeof forgotPasswordSchema>(raw, forgotPasswordSchema);
    await this.passwordResetService.requestReset(body.email);
  }

  @Post("/reset-password")
  @HttpCode(200)
  async resetPassword(@Body() raw: unknown): Promise<void> {
    return runOrThrowHttp(async () => {
      const body = validateOrThrow<typeof resetPasswordSchema>(raw, resetPasswordSchema);
      await this.passwordResetService.consumeReset(body.token, body.newPassword);
    });
  }

  @Get("/sessions")
  @UseGuards(JwtAuthGuard)
  async listSessions(
    @Req() request: Request & { user: CurrentUser },
  ): Promise<ReadonlyArray<{ id: string; sessionToken: string; expires: Date }>> {
    return runOrThrowHttp(async () => {
      const allowed = this.rbacService.can(
        { id: request.user.id, role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: request.user.id },
      );
      if (!allowed) {
        throw new Error("RbacService denied session:read:own — invariant violation");
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
        throw new Error("RbacService denied session:revoke:own — invariant violation");
      }
      await this.sessionService.revokeSession(sessionId, request.user.id);
    });
  }
}
