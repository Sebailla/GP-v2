import { z } from "zod";

/**
 * Canonical Zod schema for the `POST /auth/register` request body.
 *
 * Lives at `libs/features/auth/shared/schemas/register.ts` per design §4.2.
 * Same dual consumption as `loginSchema` (NestJS controller + Next.js form).
 *
 * Boundary contract (mirrors design §4.2 verbatim):
 *  - email: valid email format.
 *  - password: 8 to 128 characters (matches `loginSchema`).
 *  - name: 1 to 120 characters (REQUIRED — not optional). The previous
 *    `registerInputSchema` inlined in `auth-service.ts` made `name`
 *    optional; the design §4.2 canonical schema makes it required.
 *    Service code MUST surface ValidationError for missing/empty names.
 */

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

export type RegisterInput = z.infer<typeof registerSchema>;
