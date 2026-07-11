/**
 * Public API of @features/auth (server).
 *
 * Slice 3 batch 1 ships AuthService.login + the supporting error classes.
 * Slice 3 batch 2 widens this barrel with AuthService.register and
 * SessionService. Slice 3 batch 3 adds RbacService + the events wiring
 * + the UserRepository port + PrismaUserRepository. Slice 3 batch 4
 * closes the umbrella T3.4 with PasswordResetService + the
 * PasswordResetTokenRepository port. Slice 3 batch 5 lands the 4R fixes
 * (F1/F2/F3/F4/F8) + T3.8 REFACTOR. Slice 3 batch 6 (this entry) ships
 * the shared Zod schemas (at `libs/features/auth/shared/schemas/`),
 * `SessionRepository` + `PrismaSessionRepository`, the NestJS auth
 * module + controller, the `requestReset` dispatcher-failure handling,
 * the AuthService / SessionService refactors to use the UserRepository
 * (and SessionRepository) ports, and the `wireAuthEvents` cleanup
 * (Pattern A on SessionService + RbacService).
 *
 * Consumers (apps/api, apps/web, sibling slices via @core/events):
 *   import { AuthService, SessionService, RbacService, PasswordResetService, AuthError, ValidationError } from "@features/auth";
 *   import type { LoginInput, LoginResult, RegisterInput, CurrentUser } from "@features/auth";
 */

export { AuthService } from "./auth-service.js";
export type { LoginInput, LoginResult, RegisterInput } from "./auth-service.js";
export { SessionService } from "./session-service.js";
export type { CurrentUser } from "./session-service.js";
export { RbacService } from "./rbac-service.js";
export type { Action, Actor, Resource, ResourceKind, Role } from "./rbac-service.js";
export { PasswordResetService } from "./password-reset.service.js";
export type { AuthEventDispatcher } from "./events.js";
export { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository.js";
export { PrismaPasswordResetTokenRepository } from "./infrastructure/repositories/prisma-password-reset-token.repository.js";
export { PrismaSessionRepository } from "./infrastructure/repositories/prisma-session.repository.js";
export type { UserRecord, UserRepository } from "./domain/interfaces/user.repository.js";
export type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from "./domain/interfaces/password-reset-token.repository.js";
export type { SessionRecord, SessionRepository } from "./domain/interfaces/session.repository.js";
export { AuthError, ValidationError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";
// F2 audit sink — the slice's console.error sink for dispatcher
// failures (default; production swaps for pino/Sentry).
export { defaultAuditSink } from "./password-reset.service.js";

// Slice 3 batch 6 (T3.2 partial) — re-export the canonical Zod schemas
// from the shared barrel so the NestJS controller (apps/api) can
// import both the validator and the inferred TS type from a single
// path. The schemas themselves live at
// `libs/features/auth/shared/schemas/` per design §4.2; this is the
// public seam for the consumer.
//
// NOTE: `LoginInput` + `RegisterInput` are also re-exported above
// from `./auth-service.js` (the service's own parse shapes). We
// re-export them from the schemas barrel too — TypeScript's
// structural typing treats them as identical (the schemas are the
// single source of truth), so no TS2300 collision.
export {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sessionListSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SessionListResponse,
} from "../../shared/schemas/index.js";
