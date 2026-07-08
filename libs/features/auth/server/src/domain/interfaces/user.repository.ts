/**
 * Domain port for User lookups.
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.1
 * (AuthService.verifyPassword, AuthService.register,
 * PasswordResetService.requestReset) and §5.1 (transactions slice
 * references the user by id and role). The slice-wide rule is that
 * business code imports `UserRepository` (this interface), NOT
 * `prisma.user` directly — keeps the domain unit-testable with in-memory
 * fakes.
 *
 * Slice 3 batch 3 only shipped the interface declaration; the concrete
 * `PrismaUserRepository` lives at
 * `src/infrastructure/repositories/prisma-user.repository.ts` and is
 * NOT yet wired into `AuthService` or `SessionService` (those still
 * call `prisma.user.findUnique` / `prisma.user.findUnique` directly).
 * Slice 3 batch 4 (this batch) extends the port with `updatePassword`
 * — `PasswordResetService.consumeReset` is the first service to take
 * a mutation method through this interface. Refactoring
 * `AuthService.register` to use `create(...)` on this same port is a
 * separate refactor (slice 3 batch 5+ alongside the wrapper cleanup).
 *
 * Methods:
 *  - `findById(id)`: lookup a user by primary key. Returns `null` when
 *    not found. Callers (RBAC guards, sessions list) use this.
 *  - `findByEmail(email)`: lookup by email. Returns `null` when not
 *    found. Callers (AuthService.login, AuthService.register,
 *    PasswordResetService.requestReset) use this.
 *  - `updatePassword(id, hashedPassword)`: replace the user's
 *    `hashedPassword`. Used by `PasswordResetService.consumeReset` to
 *    apply a credential swap after a valid reset token consumes the
 *    token. The implementation owns the cost factor (bcrypt 10 per
 *    design §4.1) AND the storage call to `prisma.user.update`; the
 *    domain hands a pre-hashed value to keep the cost factor visible
 *    at the service boundary.
 */

/**
 * Minimal User projection returned by `UserRepository` reads. The
 * shape is intentionally narrow — RBAC needs `id` + `role`; login
 * needs `id` + `email` + `hashedPassword`. Full columns (createdAt /
 * updatedAt / etc.) stay private to the data layer until a consumer
 * needs them.
 */
export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly role: "USER" | "ADMIN";
  /** `null` for OAuth-only accounts (no password credential). */
  readonly hashedPassword: string | null;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  /**
   * Replace the user's `hashedPassword` with the supplied value. The
   * caller (PasswordResetService.consumeReset) is responsible for
   * hashing the new password with bcrypt cost 10 BEFORE the call —
   * this method only persists the result.
   */
  updatePassword(id: string, hashedPassword: string): Promise<void>;
}