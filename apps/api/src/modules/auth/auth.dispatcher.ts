/**
 * DI token for the auth-slice event dispatcher.
 *
 * Lives in its own file (not `auth.module.ts`) to avoid the
 * circular import between `auth.module.ts` (defines the provider)
 * and `auth.controller.ts` (consumes the token via `@Inject`).
 * When both files reference the symbol from the same module,
 * TypeScript's emit order can produce `undefined` at the
 * `@Inject(...)` site under `verbatimModuleSyntax: false` —
 * this file breaks the cycle by being a leaf module with no
 * other dependencies.
 *
 * Module-2 PR #3 (task 3.4): introduced alongside the
 * AuthController subscription to `auth.password-reset.requested`.
 */
export const AUTH_DISPATCHER = "AUTH_DISPATCHER";