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
 * Slice 3 batch 3 only ships the interface declaration; the concrete
 * `PrismaUserRepository` lives at
 * `src/infrastructure/repositories/prisma-user.repository.ts` and is
 * NOT yet wired into `AuthService` or `SessionService` (those still
 * call `prisma.user.findUnique` / `prisma.user.findUnique` directly).
 * Slice 3 batch 4+ refactors `AuthService` / `SessionService` /
 * `PasswordResetService` to depend on this interface (single source of
 * truth for the User read path), at which point the direct
 * `prisma.user.*` calls in those services become forbidden by code
 * review.
 *
 * Methods:
 *  - `findById(id)`: lookup a user by primary key. Returns `null` when
 *    not found. Callers (RBAC guards, sessions list) use this.
 *  - `findByEmail(email)`: lookup by email. Returns `null` when not
 *    found. Callers (AuthService.login, AuthService.register,
 *    PasswordResetService.requestReset) use this.
 *
 * The interface does NOT expose mutating methods (`create`,
 * `update`, `delete`) on purpose: the slice-wide decision is that
 * mutating paths go through a dedicated `UserWriter` port (deferred to
 * slice 3 batch 4+). Today, `AuthService.register` and
 * `PasswordResetService.consumeReset` mutate the User row directly via
 * `prisma.user.create` / `prisma.user.update`; refactoring those into
 * a `UserWriter` interface is out of scope here.
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
}