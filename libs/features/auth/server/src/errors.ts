/**
 * Domain error types for the auth slice (T3.2 GREEN step).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`
 * (Sign-in scenarios) and the error-handling skill:
 *  - `AuthError` carries a stable machine-readable `code` so callers
 *    (NestJS controllers, NextAuth callbacks, dev mailbox) can branch
 *    on the failure mode without parsing the human message.
 *  - `ValidationError` is thrown at the boundary when the Zod schema
 *    rejects input (AC-4). It is the canonical signal that the input
 *    never reached the auth domain — controllers convert it to 400.
 *
 * Codes are an exhaustive union of the auth-slice failure modes this
 * slice ships in batch 1. Additional codes (TOKEN_EXPIRED, RESET_INVALID,
 * FORBIDDEN, etc.) land with their parent services in later batches.
 */

export type AuthErrorCode =
  | "USER_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_SESSION"
  | "SESSION_EXPIRED"
  | "INVALID_RESET_TOKEN";

export class AuthError extends Error {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.code = code;
  }
}

/**
 * Thrown at the input boundary when Zod rejects the supplied value.
 * Carries the raw Zod issue list so callers (controllers, action
 * handlers) can project it to a 400 response with field-level detail.
 *
 * The class itself is intentionally tiny: validation is a Zod
 * concern, and the application layer maps `error.issues` to its
 * public error shape.
 */
export class ValidationError extends Error {
  public readonly issues: ReadonlyArray<{
    path: ReadonlyArray<string | number>;
    message: string;
  }>;

  constructor(
    issues: ReadonlyArray<{
      path: ReadonlyArray<string | number>;
      message: string;
    }>,
    message?: string,
  ) {
    super(message ?? "Validation failed");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * F2 fix (4R-driven correction): thrown by `RbacService.changeRole`
 * when the operation would demote the LAST remaining admin to USER.
 * Without this safeguard the system can become permanently
 * admin-less (every admin demoted, no path back to ADMIN except
 * direct SQL). The controller maps this error to HTTP 409 Conflict
 * with the localized `admin.errors.lastAdmin` copy.
 *
 * Code is a stable machine-readable string so the controller can
 * branch on it without parsing the human message (same contract as
 * `AuthError.code` above).
 */
export type UserNotFoundErrorCode = "USER_NOT_FOUND";

export class UserNotFoundError extends Error {
  public readonly code: UserNotFoundErrorCode = "USER_NOT_FOUND";

  constructor(message?: string) {
    super(message ?? "user not found");
    this.name = "UserNotFoundError";
  }
}

export type SerializationFailedErrorCode = "SERIALIZATION_FAILED";

export class SerializationFailedError extends Error {
  public readonly code: SerializationFailedErrorCode = "SERIALIZATION_FAILED";

  constructor(message?: string) {
    super(message ?? "serialization_failed");
    this.name = "SerializationFailedError";
  }
}

export type LastAdminErrorCode = "LAST_ADMIN_DEMOTE";

export class LastAdminError extends Error {
  public readonly code: LastAdminErrorCode;

  constructor(message?: string) {
    super(message ?? "cannot demote the last remaining admin");
    this.name = "LastAdminError";
    this.code = "LAST_ADMIN_DEMOTE";
  }
}
