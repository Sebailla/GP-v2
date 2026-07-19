import { z } from "zod";

/**
 * M3 (module-3-superadmin) admin Zod schemas.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §5
 * (Interfaces / Contracts), the three schemas below are the
 * single source of truth for the admin endpoints' request
 * validation. They live under `libs/features/auth/shared/schemas/`
 * so the `no-schemas-outside-shared` ESLint rule (AGENTS.md §7)
 * enforces the path — any Zod schema declared elsewhere fails
 * CI.
 *
 * Dual consumption pattern (carried from slice 3 batch 6):
 *  - Server: NestJS `ZodValidationPipe` runs the schema before
 *    the controller method body — invalid bodies never reach
 *    RbacService / SessionService.
 *  - Client: the Next.js admin forms (slice 4 — Phase 4) use the
 *    SAME schema as a `@hookform/resolvers/zod` resolver so a
 *    client-side typo surfaces the same error message as the
 *    server.
 *
 * Schema shape (verbatim from design §5):
 *
 *  - `ListUsersQuerySchema` — `{ limit, offset }` with defaults
 *    `limit=50`, `offset=0`. Coerced from query-string strings.
 *  - `ChangeRoleBodySchema` — `{ role: "USER" | "ADMIN" }`. Closed
 *    enum — the controller MUST reject any value outside this set
 *    before touching the DB.
 *  - `ListSessionsQuerySchema` — `{ userId }` shaped as a UUID.
 *    Matches the `users.id` column (`@default(cuid())` produces
 *    cuid IDs in practice; the schema accepts UUIDs because
 *    NextAuth's adapter contract can hand either). The controller
 *    routes a non-UUID `userId` to a 400.
 */

// ---------------------------------------------------------------------------
// ListUsersQuerySchema
// ---------------------------------------------------------------------------

export const ListUsersQuerySchema = z.object({
  // The query string carries strings (e.g. `?limit=10&offset=20`); the
  // schema coerces to integers. Coercion MUST be at the boundary — the
  // service receives numbers, never strings.
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

// ---------------------------------------------------------------------------
// ChangeRoleBodySchema
// ---------------------------------------------------------------------------

export const ChangeRoleBodySchema = z.object({
  // Closed enum mirrors the `Role` enum in the Prisma schema. Values
  // outside USER|ADMIN are rejected with a Zod error so the controller
  // never has to defend against a bogus role.
  role: z.enum(["USER", "ADMIN"]),
});

export type ChangeRoleBody = z.infer<typeof ChangeRoleBodySchema>;

// ---------------------------------------------------------------------------
// ListSessionsQuerySchema
// ---------------------------------------------------------------------------

export const ListSessionsQuerySchema = z.object({
  userId: z.string().uuid(),
});

export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;