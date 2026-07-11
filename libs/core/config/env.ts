import { parseEnv } from "./env.schema";

/**
 * The validated, frozen env consumed by the rest of the workspace.
 * Fails-fast at import time — a missing or malformed var throws a
 * `ZodError` listing every offending field.
 *
 * Consumers (apps/api, apps/web) must import this constant at the
 * top of their entry file so the validation runs before any other
 * initialization.
 */
export const env = parseEnv(process.env);
