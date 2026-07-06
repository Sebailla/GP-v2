/**
 * Shared constants for the auth slice.
 *
 * Per slice 3 batch 5 (4R finding R2 #4): the bcrypt cost factor (10)
 * is duplicated across `auth-service.ts` and `password-reset.service.ts`
 * with a magic literal. Centralising here keeps the cost factor a
 * single, testable, grep-targetable symbol. Per design §4.1 the value
 * is fixed at 10 for the reference repo; production deployments are
 * expected to surface this as an env-configurable knob (deferred to
 * the env-config wiring in slice 6+).
 *
 * Tests assert the EXACT value (rather than importing the constant)
 * so a future bump must update both the production call site AND the
 * test assertion in the same commit — a deliberate breaking change
 * that keeps the constant and its assertions in lockstep.
 */

/**
 * bcrypt cost factor for new password hashes.
 *
 * Pinned at 10 per design §4.1. Lower than the production default of
 * 12 to keep the reference repo's test suite fast (bcrypt rounds are
 * CPU-bound); production hardening (env knob, passwordHasher port)
 * lands in the env-config slice.
 */
export const BCRYPT_COST_FACTOR = 10;
