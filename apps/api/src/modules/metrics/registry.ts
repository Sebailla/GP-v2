import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled.",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
});

export const httpErrors5xxTotal = new Counter({
  name: "http_errors_5xx_total",
  help: "HTTP requests that returned a 5xx status.",
  labelNames: ["method", "path"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "path"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const rateLimitBlockedTotal = new Counter({
  name: "rate_limit_blocked_total",
  help: "HTTP requests blocked by the rate limiter.",
  labelNames: ["endpoint"] as const,
  registers: [metricsRegistry],
});

// ---------------------------------------------------------------------------
// Auth observability counters (module-5-production-hardening, phase 4 — D5).
//
// Per `openspec/changes/module-5-production-hardening/design.md` §5 + the
// `auth-server-surface` spec's "Observability Metrics for Auth Operations"
// requirement, the registry MUST expose 7 PII-safe counters:
//
//   - auth_login_success_total{email_domain}
//   - auth_login_failure_total{reason, email_domain}
//   - auth_password_reset_requested_total
//   - auth_password_reset_completed_total
//   - auth_admin_operation_total{operation, actor_role}
//   - auth_session_validations_total
//   - auth_session_validations_failed_total
//
// PRIVACY CONTRACT (per `pattern/pino-bracket-notation-redaction`):
//   - No label may contain a raw email address, userId UUID, or IP.
//   - The `email_domain` label carries ONLY the registered domain part
//     (e.g., `gmail.com` from `alice@gmail.com`); callers MUST derive
//     the domain upstream and pass it explicitly.
//   - The `reason` label is constrained to a closed enum
//     (`invalid_credentials` | `rate_limited` | `account_locked` |
//     `unknown`); the `operation` label is constrained to a closed enum
//     (`list_users` | `change_role` | `list_sessions` | `revoke_session`
//     | `revoke_all_sessions` | `list_audit` | `purge_audit_dry_run` |
//     `purge_audit_real`); the `actor_role` label is constrained to
//     `ADMIN` (the only role allowed to reach the admin surface).
// ---------------------------------------------------------------------------

/**
 * The closed enum for `auth_login_failure_total.reason`. A label
 * outside this set is a contract violation; callers MUST narrow to
 * one of these values before incrementing the counter.
 */
export const AUTH_LOGIN_FAILURE_REASONS = [
  "invalid_credentials",
  "rate_limited",
  "account_locked",
  "unknown",
] as const;
export type AuthLoginFailureReason = (typeof AUTH_LOGIN_FAILURE_REASONS)[number];

/**
 * The closed enum for `auth_admin_operation_total.operation`. Mirrors
 * the 8 admin endpoints under `/admin/*` (5 user/session endpoints +
 * 2 audit endpoints + change-role).
 */
export const AUTH_ADMIN_OPERATIONS = [
  "list_users",
  "change_role",
  "list_sessions",
  "revoke_session",
  "revoke_all_sessions",
  "list_audit",
  "purge_audit_dry_run",
  "purge_audit_real",
] as const;
export type AuthAdminOperation = (typeof AUTH_ADMIN_OPERATIONS)[number];

/** Closed enum for `actor_role`. Today only ADMIN reaches admin ops. */
export const AUTH_ADMIN_ACTOR_ROLES = ["ADMIN"] as const;
export type AuthAdminActorRole = (typeof AUTH_ADMIN_ACTOR_ROLES)[number];

/**
 * Derive the registered domain part from a raw email address. The
 * function returns `null` for malformed input (no `@`, empty local,
 * empty domain) so the caller can fall back to a safe default
 * (e.g., `unknown`). The function does NOT validate email syntax
 * beyond the `@` split — domain-only is the privacy contract.
 *
 * The split is intentionally narrow: only `email.split("@")[1]` is
 * read. Email subaddressing (`alice+tag@gmail.com`) and IDN
 * (internationalized domain names) are out of scope — they would
 * require an IDN-aware parser, and the counter only cares about
 * the domain shard for grouping, not for delivery.
 */
export function deriveEmailDomain(email: string | null | undefined): string | null {
  if (typeof email !== "string" || email.length === 0) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return domain.length > 0 ? domain : null;
}

export const authLoginSuccessTotal = new Counter({
  name: "auth_login_success_total",
  help: "Successful login attempts, labeled by registered email domain.",
  labelNames: ["email_domain"] as const,
  registers: [metricsRegistry],
});

export const authLoginFailureTotal = new Counter({
  name: "auth_login_failure_total",
  help: "Failed login attempts, labeled by reason and registered email domain.",
  labelNames: ["reason", "email_domain"] as const,
  registers: [metricsRegistry],
});

export const authPasswordResetRequestedTotal = new Counter({
  name: "auth_password_reset_requested_total",
  help: "Password reset requests received (one per forgot-password call).",
  registers: [metricsRegistry],
});

export const authPasswordResetCompletedTotal = new Counter({
  name: "auth_password_reset_completed_total",
  help: "Password resets that successfully replaced the user's password.",
  registers: [metricsRegistry],
});

export const authAdminOperationTotal = new Counter({
  name: "auth_admin_operation_total",
  help: "Admin surface operations, labeled by operation kind and actor role.",
  labelNames: ["operation", "actor_role"] as const,
  registers: [metricsRegistry],
});

export const authSessionValidationsTotal = new Counter({
  name: "auth_session_validations_total",
  help: "Successful session-token validations.",
  registers: [metricsRegistry],
});

export const authSessionValidationsFailedTotal = new Counter({
  name: "auth_session_validations_failed_total",
  help: "Failed session-token validations (expired, malformed, or revoked).",
  registers: [metricsRegistry],
});
