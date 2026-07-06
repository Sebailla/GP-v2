import { z } from "zod";

/**
 * Canonical Zod schema for the `POST /auth/login` request body.
 *
 * Lives at `libs/features/auth/shared/schemas/login.ts` per design §4.2
 * and the slice-wide ESLint rule `no-schemas-outside-shared`. The same
 * schema is consumed by:
 *  - The NestJS `AuthController` (`apps/api/modules/auth/auth.controller.ts`)
 *    through `ZodValidationPipe`.
 *  - The Next.js `LoginForm` (slice 4) through `@hookform/resolvers/zod`.
 *
 * Boundary contract (mirrors design §4.2 verbatim):
 *  - email: valid email format.
 *  - password: 8 to 128 characters (inclusive). The lower bound matches
 *    the min-strength policy used by `registerSchema` and
 *    `resetPasswordSchema`; the upper bound caps at 128 chars to
 *    bound bcrypt work.
 *
 * `password` is intentionally strict here (min 8) — the inline
 * `loginInputSchema` in `auth-service.ts` used `min(1)` because that
 * file is internal and does not accept external input; this schema is
 * the boundary schema for HTTP traffic.
 */

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
