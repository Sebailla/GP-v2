import { describe, it, expect, vi } from "vitest";

import { createInMemoryDispatcher, redactSensitive } from "../dispatcher";
import type { DomainEvent } from "../types";

/**
 * TDD contract for `redactSensitive` (slice 3 batch 5 / brief F3 RED).
 *
 * Per `libs/core/events/src/dispatcher.ts#recordInBuffer` and the
 * canonical Zod schema at `libs/core/events/src/types.ts`
 * `authPasswordResetRequestedPayload.token` (annotated as
 * `"// Raw token is dev-only ... production deployments should
 * remove this field or replace it with a magic-link slug."`).
 *
 * Threat model (F3 \u2014 CRITICAL): when a subscriber logs the full
 * `DomainEvent` (e.g., the slice-4 `DevMailbox`, a future Sentry
 * hook, an audit-log subscriber), the raw token leaks within the
 * 1h validity window. The Zod schema annotates the field as
 * dev-only, but production subscribers may still log the full
 * event by accident.
 *
 * Fix per brief F3:
 *  1. `redactSensitive(event: DomainEvent): DomainEvent` returns
 *     a copy with top-level `payload.token` replaced by the
 *     sentinel `'***REDACTED***'`.
 *  2. Apply ONLY at `recordInBuffer` \u2014 handlers receive the
 *     RAW event (the email handler needs the real token to send
 *     the email). The ring buffer holds the redacted copy;
 *     `replay()` returns it.
 *  3. Non-token payload fields are preserved verbatim (no
 *     over-redaction).
 *
 * RED state at this commit:
 *  - `redactSensitive` does NOT exist yet (F3 GREEN ships it).
 *  - `recordInBuffer` does NOT redact (F3 GREEN updates it).
 *  - Every test in this file fails for the expected "feature
 *    missing" reason.
 */

const eventWithToken = (rawToken: string, overrides: Partial<DomainEvent> = {}): DomainEvent => ({
  name: "auth.password-reset.requested",
  userId: "u1",
  payload: {
    userId: "u1",
    token: rawToken,
    requestedAt: new Date("2030-01-01T00:00:00Z"),
  },
  occurredAt: new Date("2030-01-01T00:00:00Z"),
  ...overrides,
});

describe("redactSensitive (F3)", () => {
  it("replaces top-level payload.token with '***REDACTED***' (the literal sentinel)", () => {
    const rawToken = "raw-secret-token-1234567890ABCDEF";
    const event = eventWithToken(rawToken);

    const redacted = redactSensitive(event);

    expect((redacted.payload as { token: string }).token).toBe("***REDACTED***");
    // Non-token fields preserved.
    expect((redacted.payload as { userId: string }).userId).toBe("u1");
    expect((redacted.payload as { requestedAt: Date }).requestedAt).toBeInstanceOf(Date);
    // Envelope preserved.
    expect(redacted.name).toBe("auth.password-reset.requested");
    expect(redacted.userId).toBe("u1");
  });

  it("does NOT mutate the source event (immutable redaction \u2014 callers keep their raw copy)", () => {
    const rawToken = "raw-secret-token-1234567890ABCDEF";
    const event = eventWithToken(rawToken);

    redactSensitive(event);

    expect((event.payload as { token: string }).token).toBe(rawToken);
  });

  it("leaves events WITHOUT a payload.token field untouched (no over-redaction)", () => {
    const event: DomainEvent = {
      name: "auth.password-reset.completed",
      userId: "u1",
      payload: {
        userId: "u1",
        resetAt: new Date("2030-01-01T00:00:00Z"),
      },
      occurredAt: new Date("2030-01-01T00:00:00Z"),
    };

    const redacted = redactSensitive(event);

    expect(redacted.payload).toEqual({
      userId: "u1",
      resetAt: new Date("2030-01-01T00:00:00Z"),
    });
  });

  it("leaves events WITHOUT a payload object at all untouched", () => {
    const event: DomainEvent = {
      name: "auth.rbac.denied",
      userId: "u1",
      // payload intentionally a primitive to exercise the guard.
      payload: undefined as unknown,
      occurredAt: new Date("2030-01-01T00:00:00Z"),
    };

    const redacted = redactSensitive(event);

    expect(redacted).toBe(event);
  });
});

describe("InMemoryDispatcher ring buffer redaction (F3 integration)", () => {
  it("replays the REDACTED copy (handlers receive raw; buffer holds redacted)", async () => {
    const dispatcher = createInMemoryDispatcher();
    const rawToken = "raw-secret-token-1234567890ABCDEF";
    const event = eventWithToken(rawToken);

    let receivedByHandler: DomainEvent | undefined;
    const unsub = dispatcher.subscribe("auth.password-reset.requested", (e) => {
      receivedByHandler = e;
    });

    await dispatcher.dispatch(event);

    // 1. The handler received the RAW event (with the real token).
    expect(receivedByHandler).toBeDefined();
    expect((receivedByHandler!.payload as { token: string }).token).toBe(rawToken);

    // 2. The ring buffer holds the REDACTED copy.
    const replayed = dispatcher.replay("u1");
    expect(replayed).toHaveLength(1);
    expect((replayed[0]!.payload as { token: string }).token).toBe("***REDACTED***");

    unsub();
  });

  it("respects redactAtBuffer: false \u2014 buffer holds the raw event when opted out (test seam)", async () => {
    const dispatcher = createInMemoryDispatcher({ redactAtBuffer: false });
    const rawToken = "raw-secret-token-1234567890ABCDEF";
    const event = eventWithToken(rawToken);

    await dispatcher.dispatch(event);

    const replayed = dispatcher.replay("u1");
    expect(replayed).toHaveLength(1);
    expect((replayed[0]!.payload as { token: string }).token).toBe(rawToken);
  });
});
