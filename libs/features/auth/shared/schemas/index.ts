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
// M3 (module-3-superadmin) admin surface — `ListUsersQuerySchema`,
// `ChangeRoleBodySchema`, `ListSessionsQuerySchema` per
// `openspec/changes/module-3-superadmin/design.md` §5. Imported by the
// NestJS AdminController (Phase 3) and the Next.js admin forms
// (Phase 4) — single source of truth across the slice.
export {
  ListUsersQuerySchema,
  type ListUsersQuery,
  ChangeRoleBodySchema,
  type ChangeRoleBody,
  ListSessionsQuerySchema,
  type ListSessionsQuery,
} from "./admin.schemas.js";
// M4 (module-4-privacy) audit surface — `ListAuditQuerySchema` +
// `PurgeAuditBodySchema` + the `AuditActionEnum` per
// `openspec/changes/module-4-privacy/design.md` §5. Imported by the
// NestJS AdminController (Phase 2 — task 2.8 GREEN) and the Next.js
// audit-log page (Phase 3 — slice 4) — single source of truth across
// the slice, mirroring the M3 admin surface above.
export {
  AuditActionEnum,
  type AuditAction,
  ListAuditQuerySchema,
  type ListAuditQuery,
  PurgeAuditBodySchema,
  type PurgeAuditBody,
} from "./audit.schemas.js";
