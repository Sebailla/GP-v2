import { z } from "zod";

/**
 * Canonical Zod schema for the `POST /auth/reset-password` request body.
 *
 * Lives at `libs/features/auth/shared/schemas/reset-password.ts` per
 * design §4.2.
 *
 * Boundary contract:
 *  - token: 32 to 128 characters. The reset token is a hex digest of
 *    32 random bytes (`crypto.randomBytes(32).toString("hex")` →
 *    64 chars), so 32 is the minimum that satisfies the practical
 *    implementation; 128 caps any future migration to longer tokens.
 *  - newPassword: 8 to 128 characters (matches the rest of the
 *    auth-slice password policy).
 */

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: z.string().min(8).max(128),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
