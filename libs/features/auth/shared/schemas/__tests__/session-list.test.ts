import { describe, it, expect } from "vitest";

/**
 * TDD contract for `sessionListSchema` (slice 3 batch 6 — brief T3.2 RED).
 *
 * Per `openspec/changes/.../design.md` §4.2
 * (`session-list.ts — response shape (list of { id, deviceLabel, lastActiveAt })`),
 * the canonical Zod schema lives at
 * `libs/features/auth/shared/schemas/session-list.ts`.
 *
 * Shape contract:
 *  - sessions: an array of `{ id: string, deviceLabel: string, lastActiveAt: Date }`.
 *  - `sessions` may be empty (the user has no active sessions; the
 *    endpoint still returns 200 + an empty array, not 404).
 *
 * Why this exists: the response payload is the seam between the server
 * (SessionService.listActiveSessions) and the client (slice 4
 * `SessionList` component). Encoding the contract as a Zod schema lets
 * the client assert the network payload shape with the SAME validator
 * the server produces — single source of truth.
 *
 * RED state: `session-list.ts` does NOT exist yet. Every test fails for
 * the expected "feature missing" reason.
 */

describe("sessionListSchema", () => {
  it("accepts an empty sessions array", async () => {
    const { sessionListSchema } = await import("../session-list.js");
    const result = sessionListSchema.safeParse({ sessions: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessions).toEqual([]);
    }
  });

  it("accepts a populated sessions array", async () => {
    const { sessionListSchema } = await import("../session-list.js");
    const result = sessionListSchema.safeParse({
      sessions: [
        {
          id: "sess-1",
          deviceLabel: "Chrome on macOS",
          lastActiveAt: new Date("2026-07-05T12:00:00Z"),
        },
        {
          id: "sess-2",
          deviceLabel: "iPhone Safari",
          lastActiveAt: new Date("2026-07-04T08:00:00Z"),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a session missing the id field", async () => {
    const { sessionListSchema } = await import("../session-list.js");
    const result = sessionListSchema.safeParse({
      sessions: [
        {
          deviceLabel: "Chrome on macOS",
          lastActiveAt: new Date(),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a session with non-string deviceLabel", async () => {
    const { sessionListSchema } = await import("../session-list.js");
    const result = sessionListSchema.safeParse({
      sessions: [
        {
          id: "sess-1",
          deviceLabel: 12345,
          lastActiveAt: new Date(),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a session with non-Date lastActiveAt", async () => {
    const { sessionListSchema } = await import("../session-list.js");
    const result = sessionListSchema.safeParse({
      sessions: [
        {
          id: "sess-1",
          deviceLabel: "Chrome on macOS",
          lastActiveAt: "2026-07-05T12:00:00Z", // string instead of Date
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing sessions field", async () => {
    const { sessionListSchema } = await import("../session-list.js");
    const result = sessionListSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
