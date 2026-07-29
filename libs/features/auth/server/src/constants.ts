/**
 * Shared constants for the auth slice.
 *
 * Per module 5 production hardening, the bcrypt default is 12 while
 * validated test environments may opt into a lower cost through
 * BCRYPT_COST_FACTOR_OVERRIDE. Keeping the production default here
 * makes unset behavior explicit and shared by every password hash path.
 *
 * Tests assert the EXACT value (rather than importing the constant)
 * so a future bump must update both the production call site AND the
 * test assertion in the same commit — a deliberate breaking change
 * that keeps the constant and its assertions in lockstep.
 */

/**
 * bcrypt cost factor for new password hashes.
 *
 * Production default is 12. Tests can set the validated environment
 * override to 4 to keep CPU-bound bcrypt coverage fast without weakening
 * the unset runtime contract.
 */
export const BCRYPT_COST_FACTOR = 12;
