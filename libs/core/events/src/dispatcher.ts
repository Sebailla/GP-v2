import type { DomainEvent, EventName } from "./types";

/**
 * The literal sentinel used to replace `payload.token` at the
 * ring-buffer layer. Chosen to be:
 *  - Visually obvious in dev logs (a future subscriber that
 *    accidentally logs the buffered event will see the sentinel
 *    and know redaction occurred).
 *  - Parseable (operators can grep for it to count token-leak
 *    attempts in logs).
 *  - Not a value the hash-digest or any other payload field
 *    could legitimately take.
 */
export const REDACTED_TOKEN_SENTINEL = "***REDACTED***";

/**
 * F3 (CRITICAL): replace the dev-only `payload.token` field with
 * the redaction sentinel at the ring-buffer boundary.
 *
 * Threat model: the canonical Zod schema
 * (`authPasswordResetRequestedPayload.token`) is annotated
 * `"dev-only — production should remove this field"`, but a
 * subscriber (Sentry hook, dev mailbox, audit logger) may still
 * log the full `DomainEvent` and leak the raw token within the
 * 1h validity window.
 *
 * Behavior:
 *  - IMMUTABLE: returns a NEW event object (callers keep their
 *    raw copy; the source event is never mutated).
 *  - TARGETED: only the literal top-level `payload.token` field
 *    is redacted. No deep traversal, no over-redaction.
 *  - HANDLERS RECEIVE RAW: `createInMemoryDispatcher` calls
 *    handlers with the unredacted event (the email handler
 *    needs the real token to send the email). Only the ring
 *    buffer holds the redacted copy.
 *
 * Used by `InMemoryDispatcher.recordInBuffer` (see DispatcherOptions
 * .`redactAtBuffer` for the opt-out).
 */
export function redactSensitive(event: DomainEvent): DomainEvent {
  if (
    event.payload === null ||
    event.payload === undefined ||
    typeof event.payload !== "object"
  ) {
    return event;
  }
  const payload = event.payload as Record<string, unknown>;
  if (!("token" in payload)) {
    return event;
  }
  return {
    ...event,
    payload: {
      ...payload,
      token: REDACTED_TOKEN_SENTINEL,
    },
  };
}

/**
 * In-memory pub/sub for domain events.
 *
 * Why in-memory: the reference repo is a single-process scaffold;
 * no external broker (Redis/NATS) is in scope. The interface here
 * is the seam — slice N+ can swap the implementation behind the
 * `createInMemoryDispatcher` factory without touching feature code.
 *
 * Concurrency: dispatch is sequential per subscriber (await each),
 * but errors in one subscriber do not abort the rest of the chain.
 * Synchronous and rejected handlers are caught and surfaced via
 * the optional error sink.
 */

export const RING_BUFFER_CAPACITY = 100;

export type EventHandler = (event: DomainEvent) => Promise<void> | void;
export type ErrorSink = (event: DomainEvent, error: unknown, handler: EventHandler) => void;

export interface InMemoryDispatcher {
  dispatch(event: DomainEvent): Promise<void>;
  subscribe(name: EventName, handler: EventHandler): () => void;
  replay(userId: string, count?: number): DomainEvent[];
  bufferSize(userId: string): number;
}

export interface DispatcherOptions {
  onError?: ErrorSink;
  /**
   * F3 (CRITICAL) guardrail opt-out: when `true` (the default),
   * the ring buffer stores the redacted copy (`payload.token`
   * replaced with `REDACTED_TOKEN_SENTINEL`). When `false`, the
   * raw event is stored \u2014 useful for tests that need to assert
   * what the handler received.
   *
   * Always leave `true` in production. The only legitimate
   * `false` is from tests or the slice-4 dev mailbox's debug
   * mode (which never reaches a real user).
   */
  redactAtBuffer?: boolean;
}

export function createInMemoryDispatcher(options: DispatcherOptions = {}): InMemoryDispatcher {
  const handlers = new Map<EventName, Set<EventHandler>>();
  const buffers = new Map<string, DomainEvent[]>();
  const onError: ErrorSink =
    options.onError ??
    ((event, error) => {
      // Default sink: log to console.error without leaking payload
      // contents. Real pino wiring lands in slice 6 (auth-client log
      // capture) — this default is only here so dev/test output is
      // observable.
      console.error(
        `[events] handler threw for "${event.name}":`,
        error instanceof Error ? error.message : String(error)
      );
    });
  // F3: redact-at-buffer is ON by default (the secure default).
  // Tests opt out via `{ redactAtBuffer: false }` when they need
  // to assert the raw event was buffered.
  const redactAtBuffer: boolean = options.redactAtBuffer ?? true;

  function recordInBuffer(event: DomainEvent): void {
    if (event.userId === undefined) return;
    let buffer = buffers.get(event.userId);
    if (buffer === undefined) {
      buffer = [];
      buffers.set(event.userId, buffer);
    }
    // F3: store the redacted copy; handlers in `dispatch()` below
    // still see the raw event (they need the token to email the
    // user, etc.).
    const stored = redactAtBuffer ? redactSensitive(event) : event;
    buffer.push(stored);
    while (buffer.length > RING_BUFFER_CAPACITY) {
      buffer.shift();
    }
  }

  return {
    async dispatch(event: DomainEvent): Promise<void> {
      const set = handlers.get(event.name);
      if (set !== undefined && set.size > 0) {
        // Snapshot to allow safe iteration when handlers mutate the set.
        const snapshot = Array.from(set);
        for (const handler of snapshot) {
          try {
            await handler(event);
          } catch (error) {
            onError(event, error, handler);
          }
        }
      }
      recordInBuffer(event);
    },

    subscribe(name: EventName, handler: EventHandler): () => void {
      let set = handlers.get(name);
      if (set === undefined) {
        set = new Set();
        handlers.set(name, set);
      }
      set.add(handler);
      return () => {
        const current = handlers.get(name);
        if (current !== undefined) {
          current.delete(handler);
          if (current.size === 0) handlers.delete(name);
        }
      };
    },

    replay(userId: string, count?: number): DomainEvent[] {
      const buffer = buffers.get(userId);
      if (buffer === undefined || buffer.length === 0) return [];
      if (count === undefined || count >= buffer.length) {
        return buffer.slice();
      }
      return buffer.slice(buffer.length - count);
    },

    bufferSize(userId: string): number {
      return buffers.get(userId)?.length ?? 0;
    },
  };
}