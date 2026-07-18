/**
 * apps/web/lib/google-enabled.ts — module 2 public-auth (PR #1, task 1.5)
 * + PR #4 task 4.6 (`google-mock` gating per design D4).
 *
 * Pure predicates for "is Google OAuth configured in this environment?".
 * The check is intentionally trivial — env vars must be present
 * AND non-empty after `.trim()`. Any future check (e.g. validating the
 * client-id shape, checking for an allow-list, etc.) belongs here so the
 * call sites stay one-line.
 *
 * Per `openspec/changes/module-2-public-auth/proposal.md` §Risks:
 *   "Google client-id (Med) → `isGoogleConfigured()` + mock"
 * — the sign-in surface MUST hide the Google button when creds are
 * missing (so a production deploy without GOOGLE_CLIENT_ID does not
 * show a button that 500s when clicked). The predicate reads
 * `process.env` at CALL time (not module-load time) so a Vitest test
 * can mutate the env between assertions without resetting modules.
 *
 * The predicates take an optional `env` argument (default `process.env`)
 * so tests can pin a deterministic snapshot of the env without
 * touching the real `process.env`. The default keeps the call site
 * (`isGoogleConfigured()`) one-token.
 *
 * **PR #4 — `isGoogleMockEnabled()` (D4).** Per design D4 the
 * `google-mock` Credentials provider MUST register only when BOTH
 * `GOOGLE_E2E_MOCK=1` AND `NODE_ENV !== "production"`. The predicate
 * below checks BOTH conditions; the auth config in `apps/web/auth.ts`
 * reaches for it when constructing the providers array. Production
 * deploys that accidentally set `GOOGLE_E2E_MOCK=1` will see the
 * predicate return `false` (defense in depth — the predicate lives at
 * the wire boundary, not just in the auth config).
 */

/**
 * Is the real Google OAuth provider configured for this runtime?
 * Both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be present
 * and non-empty. Returns `false` in dev / test environments without
 * real Google credentials — the sign-in form omits the button in
 * that branch.
 */
export function isGoogleConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const id = env["GOOGLE_CLIENT_ID"];
  const secret = env["GOOGLE_CLIENT_SECRET"];
  if (typeof id !== "string" || id.trim() === "") return false;
  if (typeof secret !== "string" || secret.trim() === "") return false;
  return true;
}

/**
 * Is the `google-mock` Credentials provider enabled in this runtime?
 *
 * Per `design.md` D4: "`google-mock` Credentials only outside
 * production with `GOOGLE_E2E_MOCK=1`. Exercises NextAuth without
 * external instability; real Google stays M6."
 *
 * The predicate is strict on BOTH conditions: the env var must be
 * exactly `"1"` (matching the design example) AND `NODE_ENV` MUST NOT
 * be `"production"`. A production deploy with `GOOGLE_E2E_MOCK=1`
 * set (e.g. a leaked test secret) will return `false` — the auth
 * config never registers the mock provider on the production
 * surface. The defense-in-depth lives in this module so the config
 * and any future caller (`<SignInClient>`, e2e harnesses, etc.) all
 * see the same canonical predicate.
 */
export function isGoogleMockEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const e2eMock = env["GOOGLE_E2E_MOCK"];
  const nodeEnv = env["NODE_ENV"];
  if (e2eMock !== "1") return false;
  if (nodeEnv === "production") return false;
  return true;
}

/**
 * Should the SignInClient render the Google sign-in button at all?
 *
 * Combines `isGoogleConfigured()` (real Google) with the mock branch:
 * the button renders when EITHER the real Google provider is wired
 * OR the mock provider is enabled. Returning `true` for either
 * branch keeps the call site (`showGoogleButton = isGoogleSignInVisible()`)
 * stable — the underlying provider switch is internal to
 * `apps/web/auth.ts`.
 *
 * NOTE: per the spec gating requirement, "No call to the Google
 * OAuth endpoint MUST occur" when neither branch is active. The
 * SignInClient guarantees this by conditionally rendering the
 * button itself.
 */
export function isGoogleSignInVisible(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return isGoogleConfigured(env) || isGoogleMockEnabled(env);
}