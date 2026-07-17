/**
 * apps/web/lib/google-enabled.ts — module 2 public-auth (PR #1, task 1.5).
 *
 * Pure predicate for "is Google OAuth configured in this environment?".
 * The check is intentionally trivial — both env vars must be present
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
 * The predicate takes an optional `env` argument (default `process.env`)
 * so tests can pin a deterministic snapshot of the env without
 * touching the real `process.env`. The default keeps the call site
 * (`isGoogleConfigured()`) one-token.
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