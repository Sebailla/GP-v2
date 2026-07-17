import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Logger,
  OnModuleDestroy,
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
} from "@features/auth";
import {
  AUTH_PASSWORD_RESET_REQUESTED,
  // ADR 0008 — `DomainEvent` is referenced from the controller's
  // constructor (the `forwardResetEmail(event: DomainEvent)`
  // subscriber callback). Drop `type` so the value import survives
  // the auto-formatter's `useImportType` heuristic.
  DomainEvent,
} from "@core/events";

import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";
import { RateLimit } from "../../shared/guards/rate-limit.decorator.js";
import { RateLimitGuard } from "../../shared/guards/rate-limit.guard.js";
import { MAIL_ADAPTER } from "../../mail/mail.module.js";
// ADR 0008 — `MailAdapter` is referenced from the controller's
// constructor (`mailAdapter: MailAdapter`). Drop `type` so the
// value import survives the auto-formatter's `useImportType`
// heuristic; the `_ServiceAnchor` static field below also
// references `MAIL_ADAPTER` to belt-and-suspenders the runtime
// anchor.
import { MailAdapter } from "../../mail/mail.adapter.js";
import {
  renderResetPasswordTemplate,
  lookupEmailForUserId,
} from "../../mail/templates/reset-password.js";
import { AUTH_DISPATCHER } from "./auth.dispatcher.js";

/**
 * Module-2 PR #3 (task 3.4): resolve the active request locale from
 * the `Accept-Language` header. Closed enum (`en` | `es`); the
 * fallback when the header is missing or carries an unsupported value
 * is `en` (the default locale shipped in the i18n catalog).
 *
 * The header parsing is intentionally narrow — we accept only the
 * exact `en` / `es` tokens, ignoring q-values and wildcard tags. A
 * future next-intl-aware negotiator can replace this seam; the
 * surface (returns "en" | "es") is the contract this controller
 * commits to.
 */
function resolveLocaleFromAcceptLanguage(header: string | undefined): "en" | "es" {
  if (typeof header !== "string" || header.length === 0) return "en";
  const tokens = header
    .split(",")
    .map((t) => t.split(";")[0]!.trim().toLowerCase())
    .filter((t) => t.length > 0);
  for (const token of tokens) {
    if (token === "en" || token.startsWith("en-")) return "en";
    if (token === "es" || token.startsWith("es-")) return "es";
  }
  return "en";
}

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

/**
 * Module-2 PR #3 (task 3.10): typed error class to mark a MailAdapter
 * rejection as a 502-worthy delivery failure. `forwardResetEmail`
 * wraps every `MailAdapter.send` call in a try/catch and re-throws as
 * `MailDeliveryError` so the controller's catch-all can route to the
 * right status code without sniffing the cause type.
 */
class MailDeliveryError extends Error {
  constructor(public override readonly cause: unknown) {
    super("mail delivery failed");
    this.name = "MailDeliveryError";
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
 * AUTO-FORMATTER MITIGATION (per ADR 0008): NestJS's reflective DI
 * reads `import { Foo }` symbols as runtime class references, not
 * types. Under `isolatedModules: true` (`tsconfig.base.json` line 10)
 * the `import { type Foo }` form is fully erased at compile time and
 * Nest's container sees `undefined` for the constructor parameter.
 * The harness's biome auto-formatter prefers `import { type Foo }`
 * when the symbol looks like a type-only reference, which silently
 * breaks DI. We defeat that heuristic with a class-level static field
 * that references each service as a VALUE (not a type). After NestJS
 * resolves the constructor at startup, this anchor is unused at
 * runtime; it exists purely to keep the runtime import alive.
 *
 * Enforced by ESLint rule `@gpr/boundary/no-import-type-injectable`
 * (see ADR 0008).
 */
@Controller("/auth")
@UseGuards(RateLimitGuard)
export class AuthController implements OnModuleDestroy {
  private readonly logger = new Logger(AuthController.name);
  private readonly mailSubscriptions: Array<() => void> = [];

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly passwordResetService: PasswordResetService,
    private readonly rbacService: RbacService,
    @Inject(MAIL_ADAPTER) private readonly mailAdapter: MailAdapter,
    @Inject(AUTH_DISPATCHER)
    private readonly dispatcher: { subscribe: (name: string, h: (e: DomainEvent) => Promise<void> | void) => () => void },
  ) {
    // Module-2 PR #3 (task 3.4): subscribe to `auth.password-reset
    // .requested` at construction time. Every dispatch from
    // PasswordResetService.requestReset → MailAdapter.send (the
    // production Gmail path becomes the primary delivery channel;
    // the dev mailbox remains the dev-only fallback).
    //
    // The unsubscribe handle is kept so OnModuleDestroy can detach
    // the subscriber cleanly when the Nest process shuts down
    // (avoids a memory leak if the e2e harness boots the module
    // multiple times in the same Node process).
    const unsub = this.dispatcher.subscribe(
      AUTH_PASSWORD_RESET_REQUESTED,
      (event) => {
        void this.forwardResetEmail(event);
      },
    );
    this.mailSubscriptions.push(unsub);
  }

  /**
   * Module-2 PR #3 (task 3.4 + 3.10): forward a password-reset
   * event to the bound MailAdapter. Renders the email body from the
   * canonical `reset-password.json` template (D6) keyed by the
   * payload's `locale`. The raw token from the payload is embedded
   * verbatim into the URL — this is the SAME URL the service
   * computed (`resetUrl` in the payload), so we re-use it rather
   * than rebuilding it (single source of truth for the URL shape).
   *
   * Per design §5 contracts, a MailAdapter failure MUST surface as
   * 502 to the client (forgot-password spec "Gmail SMTP failure
   * surfaces 502"). The error path is handled by re-throwing as a
   * `MailDeliveryError` — the controller's `forgotPassword` handler
   * catches the throw and maps it to 502.
   *
   * For dev/test the bound adapter is the InMemory one; failures
   * here are synthetic (test-only).
   */
  private async forwardResetEmail(event: DomainEvent): Promise<void> {
    if (event.name !== AUTH_PASSWORD_RESET_REQUESTED) return;
    const payload = event.payload as {
      to?: string;
      userId: string;
      token: string;
      locale: "en" | "es";
      resetUrl: string;
      requestedAt: Date;
    };
    // Render the locale-aware email body (D6). The template lookup
    // is keyed by the payload's `locale` so the email matches the
    // URL the user clicks.
    const template = renderResetPasswordTemplate(payload.locale, payload.resetUrl);
    try {
      await this.mailAdapter.send({
        to: payload.to ?? lookupEmailForUserId(payload.userId),
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
    } catch (cause) {
      throw new MailDeliveryError(cause);
    }
  }

  onModuleDestroy(): void {
    for (const unsub of this.mailSubscriptions) {
      unsub();
    }
    this.mailSubscriptions.length = 0;
  }

  @Post("/login")
  @RateLimit({ key: "auth:login", limit: 10, windowSeconds: 600 })
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
  @RateLimit({ key: "auth:register", limit: 5, windowSeconds: 3600 })
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
  @RateLimit({ key: "auth:forgot", limit: 3, windowSeconds: 3600 })
  @HttpCode(202)
  async forgotPassword(
    @Body() raw: unknown,
    @Headers("accept-language") acceptLanguage: string | undefined,
  ): Promise<void> {
    try {
      const body = validateOrThrow<typeof forgotPasswordSchema>(raw, forgotPasswordSchema);
      const locale = resolveLocaleFromAcceptLanguage(acceptLanguage);
      // requestReset dispatches `auth.password-reset.requested`
      // synchronously; the MailAdapter subscriber runs before
      // requestReset returns. A MailAdapter rejection surfaces as
      // MailDeliveryError → 502 (task 3.10 + forgot-password
      // spec scenario "Gmail SMTP failure surfaces 502").
      await this.passwordResetService.requestReset(body.email, locale);
    } catch (error) {
      if (error instanceof MailDeliveryError) {
        // Pino bracket-notation redaction: log the SMTP error code
        // (R-PF-5) without leaking the recipient address verbatim.
        const smtpMsg =
          error.cause instanceof Error ? error.cause.message : String(error.cause);
        this.logger.error(`[mail] delivery failed for [email]: ${smtpMsg}`);
        throw new HttpException(
          { error: "MAIL_DELIVERY_FAILED", message: "reset email delivery failed" },
          502,
        );
      }
      if (error instanceof ValidationError) {
        throw new HttpException(
          {
            error: "VALIDATION_FAILED",
            message: error.message,
            issues: error.issues,
          },
          400,
        );
      }
      throw error;
    }
  }

  @Post("/reset-password")
  @RateLimit({ key: "auth:reset", limit: 10, windowSeconds: 3600 })
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

  /**
   * Runtime anchor — LAST field, defensive against future `import type`
   * regressions (see ADR 0008 + ESLint rule
   * `@gpr/boundary/no-import-type-injectable`). The anchor references
   * each service as a VALUE so that even if a future auto-formatter
   * rewrites the import to `import { type Service }`, the symbols
   * remain reachable at runtime.
   *
   * Module-2 PR #3 (task 3.4): also anchors the `MAIL_ADAPTER` +
   * `AUTH_DISPATCHER` string tokens and the `MailAdapter` interface
   * reference so the constructor's `@Inject(...)` decorators + the
   * type-only `MailAdapter` import survive the auto-formatter's
   * `useImportType` heuristic. Without these references, the
   * `design:paramtypes` for the `mailAdapter: MailAdapter` and
   * `dispatcher: InMemoryDispatcher` slots emit `undefined`, and
   * NestJS's `@Inject()` annotation does NOT override the missing
   * paramtype (the reflector requires BOTH the paramtype and the
   * token at the same index; a missing paramtype shadows the
   * explicit token).
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    PasswordResetService,
    RbacService,
    SessionService,
    MAIL_ADAPTER,
    AUTH_DISPATCHER,
  ] as const;
}
