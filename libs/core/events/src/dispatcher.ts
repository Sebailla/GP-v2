import type { DomainEvent, EventName } from "./types";

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

  function recordInBuffer(event: DomainEvent): void {
    if (event.userId === undefined) return;
    let buffer = buffers.get(event.userId);
    if (buffer === undefined) {
      buffer = [];
      buffers.set(event.userId, buffer);
    }
    buffer.push(event);
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