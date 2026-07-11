import { describe, expect, it } from "vitest";

import { createInMemoryDispatcher } from "../dispatcher";
import type { DomainEvent } from "../types";

/**
 * TDD contract for the in-memory dispatcher (T2.3).
 *
 *  - RED:    dispatch fires a single subscribed handler exactly once.
 *  - GREEN:  multiple subscribers + per-event subscription.
 *  - TRIANGULATE: unsubscribe, error isolation (one handler throws,
 *                 others still fire), ring-buffer trim (100 entries),
 *                 replay of last N events for a user.
 *
 * Each test uses a freshly-created dispatcher to avoid shared state
 * — the dispatcher is a closure-scoped singleton, not a process-wide
 * singleton (slice 4 will provide a `getDispatcher()` helper bound
 * to the request scope).
 */

const sampleEvent = (overrides: Partial<DomainEvent> = {}): DomainEvent => ({
  name: "transactions.created",
  payload: {
    transactionId: "t1",
    userId: "u1",
    amount: "10.00",
    currency: "USD",
    occurredAt: new Date("2026-07-05T00:00:00.000Z"),
  },
  occurredAt: new Date("2026-07-05T00:00:00.000Z"),
  userId: "u1",
  ...overrides,
});

describe("createInMemoryDispatcher", () => {
  describe("RED — single subscriber", () => {
    it("calls a subscribed handler exactly once on dispatch", async () => {
      const dispatcher = createInMemoryDispatcher();
      let calls = 0;
      dispatcher.subscribe("transactions.created", async () => {
        calls += 1;
      });
      await dispatcher.dispatch(sampleEvent());
      expect(calls).toBe(1);
    });

    it("passes the dispatched event to the handler", async () => {
      const dispatcher = createInMemoryDispatcher();
      let received: DomainEvent | null = null;
      dispatcher.subscribe("transactions.created", async (event) => {
        received = event;
      });
      const event = sampleEvent();
      await dispatcher.dispatch(event);
      expect(received).toBe(event);
    });
  });

  describe("GREEN — multiple subscribers + per-event subscription", () => {
    it("calls every subscriber of the matching event name", async () => {
      const dispatcher = createInMemoryDispatcher();
      let a = 0;
      let b = 0;
      dispatcher.subscribe("transactions.created", async () => {
        a += 1;
      });
      dispatcher.subscribe("transactions.created", async () => {
        b += 1;
      });
      await dispatcher.dispatch(sampleEvent());
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    it("does NOT call subscribers of unrelated event names", async () => {
      const dispatcher = createInMemoryDispatcher();
      let calls = 0;
      dispatcher.subscribe("transactions.updated", async () => {
        calls += 1;
      });
      await dispatcher.dispatch(sampleEvent({ name: "transactions.created" }));
      expect(calls).toBe(0);
    });
  });

  describe("TRIANGULATE — unsubscribe", () => {
    it("removes the subscriber when the unsubscribe function is called", async () => {
      const dispatcher = createInMemoryDispatcher();
      let calls = 0;
      const unsubscribe = dispatcher.subscribe("transactions.created", async () => {
        calls += 1;
      });
      await dispatcher.dispatch(sampleEvent());
      unsubscribe();
      await dispatcher.dispatch(sampleEvent());
      expect(calls).toBe(1);
    });

    it("unsubscribing one handler does not affect siblings", async () => {
      const dispatcher = createInMemoryDispatcher();
      let a = 0;
      let b = 0;
      const unsubA = dispatcher.subscribe("transactions.created", async () => {
        a += 1;
      });
      dispatcher.subscribe("transactions.created", async () => {
        b += 1;
      });
      unsubA();
      await dispatcher.dispatch(sampleEvent());
      expect(a).toBe(0);
      expect(b).toBe(1);
    });
  });

  describe("TRIANGULATE — error isolation", () => {
    it("continues calling remaining handlers when one handler throws", async () => {
      const dispatcher = createInMemoryDispatcher();
      let b = 0;
      dispatcher.subscribe("transactions.created", async () => {
        throw new Error("boom");
      });
      dispatcher.subscribe("transactions.created", async () => {
        b += 1;
      });
      // dispatch must NOT rethrow the synchronous handler error
      await dispatcher.dispatch(sampleEvent());
      expect(b).toBe(1);
    });
  });

  describe("TRIANGULATE — ring buffer (per user, 100 entries)", () => {
    it("records the last dispatched event for the user", async () => {
      const dispatcher = createInMemoryDispatcher();
      await dispatcher.dispatch(sampleEvent({ userId: "u1" }));
      const recent = dispatcher.replay("u1");
      expect(recent).toHaveLength(1);
      expect(recent[0]?.name).toBe("transactions.created");
    });

    it("trims the buffer to the last 100 entries per user", async () => {
      const dispatcher = createInMemoryDispatcher();
      for (let i = 0; i < 150; i += 1) {
        await dispatcher.dispatch(
          sampleEvent({
            payload: {
              transactionId: `t${i}`,
              userId: "u1",
              amount: "10.00",
              currency: "USD",
              occurredAt: new Date(2026, 6, 5),
            },
          }),
        );
      }
      const recent = dispatcher.replay("u1");
      expect(recent).toHaveLength(100);
      // The oldest entries (t0..t49) should have been trimmed; the
      // newest (t150-1, then t51..t149 preserved in FIFO order).
      const firstId = (recent[0]?.payload as { transactionId?: string })?.transactionId;
      const lastId = (recent[recent.length - 1]?.payload as { transactionId?: string })
        ?.transactionId;
      expect(firstId).toBe("t50");
      expect(lastId).toBe("t149");
    });

    it("keeps per-user buffers independent", async () => {
      const dispatcher = createInMemoryDispatcher();
      await dispatcher.dispatch(sampleEvent({ userId: "u1" }));
      await dispatcher.dispatch(sampleEvent({ userId: "u2" }));
      await dispatcher.dispatch(sampleEvent({ userId: "u2" }));
      expect(dispatcher.replay("u1")).toHaveLength(1);
      expect(dispatcher.replay("u2")).toHaveLength(2);
    });

    it("replay(N) returns at most N events", async () => {
      const dispatcher = createInMemoryDispatcher();
      for (let i = 0; i < 10; i += 1) {
        await dispatcher.dispatch(sampleEvent({ userId: "u1" }));
      }
      const lastThree = dispatcher.replay("u1", 3);
      expect(lastThree).toHaveLength(3);
    });

    it("replay returns an empty array for an unknown user", () => {
      const dispatcher = createInMemoryDispatcher();
      expect(dispatcher.replay("nope")).toEqual([]);
    });
  });
});
