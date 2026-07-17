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
];