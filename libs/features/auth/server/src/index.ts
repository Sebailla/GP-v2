/**
 * Public API of @features/auth (server).
 *
 * Slice 3 batch 1 ships AuthService.login + the supporting error classes.
 * Slice 3 batch 2 widens this barrel with AuthService.register and
 * SessionService. Subsequent batches (T3.5+) add the NextAuth config,
 * RbacService, PasswordResetService, events wiring, and the NestJS
 * controller wrappers.
 *
 * Consumers (apps/api, apps/web, sibling slices via @core/events):
 *   import { AuthService, SessionService, AuthError, ValidationError } from "@features/auth";
 *   import type { LoginInput, LoginResult, RegisterInput, CurrentUser } from "@features/auth";
 */

export { AuthService } from "./auth-service.js";
export type { LoginInput, LoginResult, RegisterInput } from "./auth-service.js";
export { SessionService } from "./session-service.js";
export type { CurrentUser } from "./session-service.js";
export { RbacService } from "./rbac-service.js";
export type { Action, Actor, Resource, ResourceKind, Role } from "./rbac-service.js";
export { AuthError, ValidationError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";