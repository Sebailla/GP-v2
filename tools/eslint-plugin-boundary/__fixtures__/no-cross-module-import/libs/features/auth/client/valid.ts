// VALID fixture for no-cross-module-import.
//
// This file IS under libs/features/<feature>/** and imports from
// @features/auth/shared - the SAME module (auth). The rule must
// allow same-module imports.

import { loginSchema } from "@features/auth/shared";

export const validate = loginSchema;