/**
 * Public API of @features/auth (server).
 *
 * Slice 3 batch 1 ships only AuthService.login + the supporting
 * error classes. Subsequent batches (T3.3+) widen this barrel with
 * the NextAuth config, SessionService, RbacService, PasswordResetService,
 * events wiring, and the NestJS controller wrappers.
 *
 * Consumers (apps/api, apps/web, sibling slices via @core/events):
 *   import { AuthService, AuthError, ValidationError } from "@features/auth";
 *   import type { LoginInput, LoginResult } from "@features/auth";
 */

export { AuthService } from "./auth-service.js";
export type { LoginInput, LoginResult } from "./auth-service.js";
export { AuthError, ValidationError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";