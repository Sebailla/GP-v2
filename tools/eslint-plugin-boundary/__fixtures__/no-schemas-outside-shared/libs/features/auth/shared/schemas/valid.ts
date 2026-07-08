// VALID fixture for no-schemas-outside-shared.
//
// This file IS under libs/features/auth/shared/schemas/ and declares
// a Zod schema. The rule's path whitelist permits this exact pattern.
//
// Note: this fixture is linted with ESLint's default parser, which
// does NOT understand TypeScript type annotations. The type-only
// assignment below is plain JS so the file parses cleanly.

import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const inferred = loginSchema;