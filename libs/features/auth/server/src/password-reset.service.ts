import { createHash, randomBytes } from "node:crypto";

import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
import { env } from "@core/config";
import bcrypt from "bcryptjs";
import type { DomainEvent } from "@core/events";

import type { AuthEventDispatcher } from "./events.js";
import { BCRYPT_COST_FACTOR } from "./constants.js";
import { AuthError } from "./errors.js";
import type { UserRepository } from "./domain/interfaces/user.repository.js";
import type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from "./domain/interfaces/password-reset-token.repository.js";

// Co-locate the error class re-export with the service that throws it,
// mirroring the auth-service.ts / session-service.ts pattern. Consumers
// (tests, the barrel `src/index.ts`) import through this module.
export { AuthError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";

/**
 * PasswordResetService — slice 3 batch 4 (brief T3.4 GREEN).
 *
 * Domain layer for the "Password Reset (Forgot + Reset, Email Mocked)"
 * requirement (auth spec §Password Reset). Lives at
 * `libs/features/auth/server/src/password-reset.service.ts` alongside
 * `auth-service.ts`, `session-service.ts`, and `rbac-service.ts`
 * (the auth-slice service surface, all flat under `src/`).
 *
 * Boundary contract (per @core/config style):
 *   1. `requestReset(email)` — look up the user; if not found, return
 *      silently (no event, no row — no email enumeration leak). If
 *      found, mint a 32+ char random token (raw; dev mailbox only),
 *      compute `tokenHash = sha256(token)`, persist the row, dispatch
 *      `auth.password-reset.requested` with the RAW token in the
 *      payload. The raw token NEVER persists to the database.
 *   2. `consumeReset(rawToken, newPassword)` — compute the hash of
 *      the supplied raw token, look up the row. If missing OR
 *      `expiresAt < now` OR `consumedAt !== null` → throw
 *      `AuthError('INVALID_RESET_TOKEN')` with generic copy. Else,
 *      `bcrypt.hash(newPassword, 10)`, hand the hash to
 *      `userRepo.updatePassword(userId, hashed)`, mark the token
 *      consumed, dispatch `auth.password-reset.completed`.
 *
 * The bcrypt cost factor (10) is fixed at the service boundary per
 * design §4.1. The auth-rbac skill recommends cost ≥ 12 for
 * production — slice 4+ surfaces this as env-configurable. The
 * precise `bcrypt.hash(newPassword, 10)` shape (NOT
 * `bcrypt.hash(newPassword, 'hash, 10')`) is asserted by the test
 * suite to keep the cost factor visible at the boundary.
 *
 * Pattern A dispatch is adopted (canonical design §4.1):
 *   - The service is constructed with the dispatcher in its
 *     constructor.
 *   - The service dispatches directly.
 *   - `wireAuthEvents` (slice 3 batch 3) is unchanged. It still wraps
 *     `SessionService.revokeSession` and `RbacService.can`; it does
 *     NOT know about `PasswordResetService`. This matches the
 *     post-cleanup shape called out in the batch 3 apply-progress
 *     risk_flag #3 — the new service does NOT introduce a new
 *     wrapper just to satisfy symmetry.
 *
 * Token format:
 *   - Raw: `crypto.randomBytes(32).toString('hex')` → 64 hex chars
 *     (always ≥ 32; the explicit minimum). The dev mailbox consumes
 *     the raw token; production should remove it from the event
 *     payload or replace it with a magic-link slug.
 *   - Persisted: `createHash('sha256').update(raw).digest('hex')` →
 *     64 hex chars of the sha256 digest. The raw token never reaches
 *     the database.
 */

/** Token TTL for a fresh reset (1h per design §4.1). */
export const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Minimum raw token length, enforced at mint time. */
export const MIN_TOKEN_LENGTH = 32;

const sha256Hex = (raw: string): string => createHash("sha256").update(raw).digest("hex");

const mintRawToken = (): string => randomBytes(32).toString("hex");

/**
 * F2: audit signal for a post-commit dispatcher failure.
 *
 * Emitted when `prisma.$transaction` committed successfully but the
 * follow-up event dispatch rejected (e.g., the dev mailbox is full,
 * a subscriber's email handler is broken, Sentry is unavailable).
 *
 * Per F2: the transaction has already committed, so the password
 * actually changed. Re-throwing the dispatcher error would surface
 * a 500 to the client AND re-fail on retry (the consumed token
 * makes the second attempt fail with `INVALID_RESET_TOKEN`,
 * leaving the user thinking the reset failed when it actually
 * worked). The audit signal is the only honest observability
 * surface here.
 *
 * TODO(slice-3+ observability): wire this to pino / Sentry when
 * the production observability stack lands. For the reference
 * repo the default sink logs to `console.error` so dev-machine
 * failures are observable.
 *
 * Discriminated by `kind` so future audit signals (e.g. password
 * hash reject, missing dispatcher) can extend the type without
 * breaking consumers.
 */
export type AuthEventDispatchFailureSignal = {
  readonly kind: "AUTH_EVENT_DISPATCH_FAILURE";
  readonly event: DomainEvent;
  readonly error: unknown;
};

/**
 * F2 port: receives audit signals from the auth-slice domain.
 *
 * Choice X (per brief): constructor-injected AuditSink. Tests
 * pass `vi.fn()`; production wires a real sink at module boot.
 */
export type AuditSink = (signal: AuthEventDispatchFailureSignal) => void;

/**
 * Default sink for the reference repo. Logs to console.error
 * with the event name + error message but NEVER the event payload
 * (the dev-only `token` field would leak to the terminal on every
 * dispatcher failure — that defeats the F3 redaction).
 *
 * TODO(slice-3+): replace with a pino / Sentry adapter when the
 * observability stack lands. The migration path is trivial —
 * change `defaultAuditSink` to point at the real sink.
 */
export const defaultAuditSink: AuditSink = (signal) => {
  const errMsg = signal.error instanceof Error ? signal.error.message : String(signal.error);
  console.error(`[auth] dispatch failure for "${signal.event.name}":`, errMsg);
};

/**
 * Builds the generic "invalid reset token" error. The message is
 * intentionally short and omits enumeration-revealing words
 * ("expired", "already used", "not found") so the response is
 * observationally identical across the three failure modes
 * (unknown token / expired token / already-consumed token).
 */
const invalidTokenError = (): AuthError =>
  new AuthError("INVALID_RESET_TOKEN", "invalid reset token");

export class PasswordResetService {
  private readonly userRepo: UserRepository;
  private readonly tokenRepo: PasswordResetTokenRepository;
  private readonly dispatcher: AuthEventDispatcher;
  private readonly prisma: PrismaClient;
  private readonly auditSink: AuditSink;

  constructor(
    userRepo: UserRepository,
    tokenRepo: PasswordResetTokenRepository,
    dispatcher: AuthEventDispatcher,
    prisma?: PrismaClient,
    auditSink: AuditSink = defaultAuditSink,
  ) {
    // F8 (WARNING) — eager failure for missing dispatcher. Without this
    // guard, a missing arg compiles cleanly (TypeScript's
    // AuthEventDispatcher type is opaque enough that callers can
    // forget it) and the failure surfaces only at first dispatch —
    // AFTER bcrypt rounds + transaction work, which makes the bug
    // hard to diagnose. The contract is documented: the dispatcher
    // is REQUIRED, not optional.
    if (typeof dispatcher !== "function") {
      throw new TypeError(
        `PasswordResetService requires an AuthEventDispatcher (a function); received ${typeof dispatcher === "undefined" ? "undefined" : String(dispatcher)}.`,
      );
    }
    this.userRepo = userRepo;
    this.tokenRepo = tokenRepo;
    this.dispatcher = dispatcher;
    this.prisma = prisma ?? defaultPrisma;
    this.auditSink = auditSink;
  }

  /**
   * Mint a single-use reset token for the supplied email and dispatch
   * the `auth.password-reset.requested` event.
   *
   * Returns void. The raw token is exposed via the dispatched event
   * payload only — the function does NOT return the token (callers
   * should subscribe to `@core/events` via the dev mailbox or a
   * production email adapter).
   *
   * Idempotent envelope: an unknown email returns silently with no
   * side effect, mirroring the "if this email is registered, you will
   * receive instructions" UX in the auth spec.
   *
   * Module-2 PR #3 (task 3.1 + 3.2): the dispatched payload now
   * carries the active `locale` and the locale-aware `resetUrl`
   * (`${PUBLIC_WEB_URL}/{locale}/reset-password/{raw}` per design D2).
   * The controller subscribes to the event and invokes the bound
   * `MailAdapter.send` with the URL; the URL must be computed here
   * (service layer) because the locale is part of the security
   * contract — building it in the controller would split the URL
   * shape across two layers and risk drift. The raw token is the
   * SAME value as `payload.token`; appearing in both fields is
   * intentional and not a duplication (the token in the URL is the
   * one the user clicks; the field name keeps the contract explicit).
   */
  async requestReset(email: string, locale: "en" | "es"): Promise<void> {
    // 1. Look up the user. Missing → silent return (no enumeration).
    const user = await this.userRepo.findByEmail(email);
    if (user === null) {
      return;
    }

    // 2. Mint the raw token (64 hex chars from 32 random bytes —
    //    satisfies the ≥32 minimal length asserted by the test).
    const rawToken = mintRawToken();
    if (rawToken.length < MIN_TOKEN_LENGTH) {
      // Defense-in-depth: `randomBytes(32)` produces 64 hex chars
      // deterministically. This branch is unreachable in practice; it
      // exists so the test's ≥32 invariant cannot be silently relaxed
      // by a future refactor of `mintRawToken()`.
      throw new Error("mintRawToken produced a sub-threshold token");
    }

    // 3. Compute the hash. ONLY the hash is persisted.
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // 4. Persist the row. `userId` is the FK; `consumedAt` is null
    //    until a successful consumeReset.
    await this.tokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // 5. Dispatch the event. The raw token is in the payload — the
    //    dev mailbox (slice 4) consumes it. `occurredAt` is the
    //    envelope timestamp (drives ring-buffer ordering).
    //
    //    Module-2 PR #3: also embed `locale`, `resetUrl`, and `to`
    //    (the recipient's email) so the controller subscriber can
    //    call MailAdapter.send with the locale-aware URL AND the
    //    recipient address without re-deriving it. The URL path is
    //    `/{locale}/reset-password/{rawToken}` per D2.
    const resetUrl = `${env.PUBLIC_WEB_URL}/${locale}/reset-password/${rawToken}`;
    const event: DomainEvent = {
      name: "auth.password-reset.requested",
      userId: user.id,
      payload: {
        userId: user.id,
        to: user.email,
        token: rawToken,
        locale,
        resetUrl,
        requestedAt: new Date(),
      },
      occurredAt: new Date(),
    };
    // 4R follow-up (slice 3 batch 5 R3 WARNING #2): wrap the dispatch
    // in try/catch + auditSink — same pattern as `consumeReset` (F2
    // fix). If the dispatcher rejects (email adapter down, mailbox
    // full, etc.), the row is already persisted but the caller
    // would otherwise see a 500. Swallowing the rejection is safe
    // here: (a) the user can retry with a fresh `requestReset` call
    // that mints a NEW token + new row; (b) the orphan row is
    // bounded by the F4 cron (deleteExpired) cleanup at ≤15 min.
    // The audit signal is the only honest observability for the
    // dispatcher failure.
    try {
      await this.dispatcher(event);
    } catch (error) {
      this.auditSink({
        kind: "AUTH_EVENT_DISPATCH_FAILURE",
        event,
        error,
      });
    }
  }

  /**
   * Validate a reset token, replace the user's password, mark the
   * token consumed, and dispatch `auth.password-reset.completed`.
   *
   * Errors:
   *  - AuthError('INVALID_RESET_TOKEN') with generic copy — thrown
   *    for ANY of: unknown token, expired token, already-consumed
   *    token. The generic copy uses no enumeration-revealing words
   *    ("expired", "already used", "not found") so the response is
   *    observationally identical across the three failure modes.
   *
   * Boundary ordering:
   *  1. Hash the inbound raw token FIRST (rawToken never crosses
   *     the port boundary).
   *  2. findByHash → null? throw.
   *  3. expiresAt < now? throw.
   *  4. consumedAt != null? throw.
   *  5. bcrypt.hash(newPassword, 10) — exact shape asserted by tests.
   *  6. userRepo.updatePassword(userId, hashed) — write the credential.
   *  7. markConsumed(tokenHash, now) — single-use guarantee.
   *  8. dispatch the completed event.
   */
  async consumeReset(rawToken: string, newPassword: string): Promise<void> {
    // 1. Hash the raw token first. The hash is the lookup key; the
    //    raw token never reaches the port.
    const tokenHash = sha256Hex(rawToken);

    // 2. Look up the row by hash.
    const row: PasswordResetTokenRecord | null = await this.tokenRepo.findByHash(tokenHash);
    if (row === null) {
      throw invalidTokenError();
    }

    // 3. Expiry check. `<=` so a token whose expiry is exactly `now`
    //    is considered expired — same boundary discipline as the
    //    SessionService.expiry check.
    if (row.expiresAt.getTime() <= Date.now()) {
      throw invalidTokenError();
    }

    // 4. Single-use check.
    if (row.consumedAt !== null) {
      throw invalidTokenError();
    }

    // 5. Hash the new password at the canonical cost factor.
    const hashed = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);

    // 6 + 7. F1: wrap BOTH writes in a single prisma.\$transaction so a
    //    failure on the second write rolls back the first (TOCTOU
    //    invariant). We use `tx.user.update` / `tx.passwordResetToken
    //    .update` DIRECTLY here — the ports' adapters route through
    //    `this.prisma.*` (a different connection), which would defeat
    //    the transaction. The ports are still used for the read
    //    (findByHash) where atomicity is not needed.
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: { hashedPassword: hashed },
      });
      await tx.passwordResetToken.update({
        where: { tokenHash },
        data: { consumedAt: new Date() },
      });
    });

    // 8. Dispatch the completed event. The transaction has already
    //    committed at step 7, so the user's password IS the new one
    //    by the time we get here. If the dispatcher rejects (the
    //    dev mailbox is full, an email adapter is broken, Sentry
    //    is unavailable, etc.), we MUST NOT re-throw — re-throwing
    //    would surface a 500 to the client AND cause retries to
    //    fail with INVALID_RESET_TOKEN (the consumed token), giving
    //    the user a contradictory UX ("reset succeeded but failed").
    //    Per F2: audit-signal the failure and return normally so the
    //    caller (eventually the future NestJS controller) responds
    //    200/204 and the user perceives success. Observability
    //    collects the failure via the AuditSink.
    const event: DomainEvent = {
      name: "auth.password-reset.completed",
      userId: row.userId,
      payload: {
        userId: row.userId,
        resetAt: new Date(),
      },
      occurredAt: new Date(),
    };
    try {
      await this.dispatcher(event);
    } catch (error) {
      this.auditSink({
        kind: "AUTH_EVENT_DISPATCH_FAILURE",
        event,
        error,
      });
      // Swallow: the transaction committed; the audit signal is the
      // observability surface; the caller resolves normally.
    }
  }
}
