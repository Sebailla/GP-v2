import { z } from "zod";

/**
 * Canonical Zod schema for the `POST /auth/forgot-password` request body.
 *
 * Lives at `libs/features/auth/shared/schemas/forgot-password.ts` per
 * design §4.2.
 *
 * Boundary contract: only `email` — the endpoint is idempotent per
 * design §4.1 (always returns 202 regardless of whether the email is
 * registered, to prevent account enumeration), so the schema only
 * validates the email shape; it does NOT validate address existence.
 */

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
