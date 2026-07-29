/**
 * Path list passed to pino's `redact` option.
 *
 * Paths use bracket notation for wildcards; `*.password` matches any
 * nested `password` field. R-PF-5 commits to redacting these paths at
 * the logger boundary so no application code can accidentally leak
 * them — pino performs the substitution BEFORE the log line is
 * serialized to JSON.
 *
 * GOTCHA (resolved during T1.2 execution): pino 9.x uses fast-redact
 * 3.5.x under the hood, which rejects wildcard path segments that
 * are not valid JS identifiers (no hyphens). The HTTP header
 * `Idempotency-Key` shows up in `req.headers["idempotency-key"]`
 * (hyphenated literal) AND as camelCase `idempotencyKey` in domain
 * objects. We list BOTH paths:
 *   - `idempotency-key`  — top-level hyphenated (HTTP header literal)
 *   - `idempotencyKey`, `*.idempotencyKey` — camelCase object keys
 *
 * The hyphenated wildcard `*.idempotency-key` is NOT valid pino syntax
 * and would throw at logger construction time.
 */
export const redactedPaths: ReadonlyArray<string> = [
  "password",
  "*.password",
  "token",
  "*.token",
  "cookie",
  "*.cookie",
  "authorization",
  "*.authorization",
  // pino 9 / fast-redact 3.5.x rejects hyphenated path segments at any
  // depth. We MUST use bracket notation for the literal HTTP header name
  // AND a separate camelCase wildcard for object keys.
  "[\"idempotency-key\"]",
  "idempotencyKey",
  "*.idempotencyKey",
  "email",
  "*.email",
  "amount",
  "*.amount",
  "reportingAmount",
  "*.reportingAmount",
  "notes",
  "*.notes",
  // M3 (module-3-superadmin — PR #3 task 3.7): IP address fields must
  // be redacted at the log boundary so a captured pino line never
  // leaks the actor's network identity. The audit row stores the IP
  // (forensic value, M4 retention), but operational logs do not need
  // it — `[REDACTED]` is enough to confirm "this admin path was hit"
  // without exposing the IP to log aggregation (Datadog, Sentry, etc.).
  // Per `pattern/pino-bracket-notation-redaction`: top-level `ip` and
  // any nested `*.ip` (e.g., a future `headers.ip` shape) — pino's
  // fast-redact accepts both literal and wildcard forms for the `ip`
  // key without hyphen issues.
  "ip",
  "*.ip",
];