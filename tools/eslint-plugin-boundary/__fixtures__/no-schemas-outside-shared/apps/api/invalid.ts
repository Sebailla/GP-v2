// INVALID fixture for no-schemas-outside-shared.
//
// This file is OUTSIDE the allowed paths
// (libs/features/<feature>/shared/schemas/* and
// libs/core/config/env.schema.ts) and declares a Zod schema literal.
// The rule MUST fire here. In production code, every schema lives
// under shared/schemas/ and is imported, never redefined inline.

import { z } from "zod";

export const adHocSchema = z.object({
  amount: z.number().positive(),
});