/**
 * Public API of @features/auth (server).
 *
 * Slice 3 batch 1 ships AuthService.login + the supporting error classes.
 * Slice 3 batch 2 widens this barrel with AuthService.register and
 * SessionService. Slice 3 batch 3 adds RbacService + the events wiring
 * + the UserRepository port + PrismaUserRepository. Slice 3 batch 4
 * (this batch) closes the umbrella T3.4 with PasswordResetService +
 * the PasswordResetTokenRepository port (its Prisma adapter lands in
 * brief T3.5b's commit). The NestJS controller wrappers + schema
 * harmonization land in slice 3 batch 5+.
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
export { wireAuthEvents } from "./events.js";
export type { AuthEventDispatcher } from "./events.js";
export { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository.js";
export { PrismaPasswordResetTokenRepository } from "./infrastructure/repositories/prisma-password-reset-token.repository.js";
export type { UserRecord, UserRepository } from "./domain/interfaces/user.repository.js";
export type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from "./domain/interfaces/password-reset-token.repository.js";
export { AuthError, ValidationError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";