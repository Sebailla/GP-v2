/**
 * Barrel for the auth-slice shared schemas.
 *
 * Per design §4.2, the canonical Zod schemas for the five auth-slice
 * endpoints live under `libs/features/auth/shared/schemas/`. They are
 * imported by both the NestJS controller (server-side validation
 * through `ZodValidationPipe`) and the Next.js client forms (slice 4,
 * through `@hookform/resolvers/zod`).
 *
 * The barrel re-exports every schema AND its inferred TS type so a
 * single `import { ... } from "@features/auth/shared/schemas"` pulls
 * both the validator and the type. No individual schema file is
 * imported elsewhere — the barrel is the public seam.
 */

export { forgotPasswordSchema, type ForgotPasswordInput } from "./forgot-password.js";
export { loginSchema, type LoginInput } from "./login.js";
export { registerSchema, type RegisterInput } from "./register.js";
export { resetPasswordSchema, type ResetPasswordInput } from "./reset-password.js";
export { sessionListSchema, type SessionListResponse } from "./session-list.js";
