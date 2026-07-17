import { NextResponse } from "next/server";

/**
 * Dev mailbox events ring buffer (Module-2 PR #3 task 3.9).
 *
 * The dev mailbox page at
 * `app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx` reads from
 * this in-memory store. In production the page is gated out by
 * `env.NODE_ENV === "production"` → `notFound()`, so this store
 * NEVER exists in a deployed build (Next.js statically
 * eliminates it because the page that imports it is unreachable).
 *
 * The store is keyed by `userId` and stores the LAST N reset
 * requests per user. The Playwright e2e in
 * `e2e/auth/forgot-reset.spec.ts` seeds entries by intercepting
 * `POST /auth/forgot-password` (the page doesn't trigger the
 * API directly; the route handler seeds events for the e2e
 * via a one-shot helper).
 *
 * For the slice-7 follow-up, a real implementation will read
 * from the API's `InMemoryDispatcher.replay(userId)` ring buffer
 * via an authenticated cross-origin fetch (the dev web client
 * and the API share the same InMemoryDispatcher instance per
 * the slice-5 events full integration).
 *
 * **Module-2 PR #3 (task 3.9):** seeded by the Playwright e2e
 * via `page.route()` to keep the e2e independent of the live
 * API. Real wiring lands in PR #5 alongside the auth.runbook.
 */

interface DevMailboxEvent {
  readonly userId: string;
  readonly token: string;
  readonly requestedAt: string;
  readonly resetUrl: string;
}

const DEV_EVENTS_PER_USER_LIMIT = 50;
const events: Map<string, DevMailboxEvent[]> = new Map();

/**
 * Append a single reset request event for the userId. Used by
 * the Playwright e2e via `page.route()` to seed the dev mailbox
 * without touching the API.
 *
 * @internal Exported for the Playwright spec only. No production
 *   caller exists.
 */
export function recordDevMailboxEvent(event: DevMailboxEvent): void {
  const list = events.get(event.userId) ?? [];
  list.push(event);
  while (list.length > DEV_EVENTS_PER_USER_LIMIT) list.shift();
  events.set(event.userId, list);
}

/**
 * Read all events for the userId. The dev mailbox page calls
 * this via a server-side import (RSC) — no fetch roundtrip.
 */
export function readDevMailboxEvents(userId: string): ReadonlyArray<DevMailboxEvent> {
  return events.get(userId) ?? [];
}

/**
 * GET /api/dev/mailbox?userId=<id>
 *
 * Returns the seeded events for the given userId. Used by the
 * Playwright e2e to read the reset URL after the forgot-password
 * mock seeds an event.
 *
 * The endpoint is DEV-ONLY — production builds return 404.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (process.env["NODE_ENV"] === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (userId === null || userId.length === 0) {
    return NextResponse.json(
      { error: "MISSING_USER_ID", message: "userId query param required" },
      { status: 400 },
    );
  }
  return NextResponse.json({ events: readDevMailboxEvents(userId) });
}

/**
 * POST /api/dev/mailbox/seed
 *
 * Body: { userId: string, token: string, resetUrl: string,
 *         requestedAt?: string }
 *
 * Seeds a single reset event into the dev mailbox ring buffer.
 * The Playwright e2e (`e2e/auth/forgot-reset.spec.ts`) calls this
 * from inside the `page.route` interceptor (URL pattern matching
 * the forgot-password endpoint) — the test mints a synthetic
 * token + URL and seeds
 * the mailbox WITHOUT touching the live API.
 *
 * Production returns 404.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (process.env["NODE_ENV"] === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "request body must be JSON" },
      { status: 400 },
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { userId?: unknown }).userId !== "string" ||
    typeof (body as { token?: unknown }).token !== "string" ||
    typeof (body as { resetUrl?: unknown }).resetUrl !== "string"
  ) {
    return NextResponse.json(
      { error: "INVALID_PAYLOAD", message: "userId + token + resetUrl required" },
      { status: 400 },
    );
  }
  const { userId, token, resetUrl } = body as {
    userId: string;
    token: string;
    resetUrl: string;
  };
  const requestedAt =
    typeof (body as { requestedAt?: unknown }).requestedAt === "string"
      ? ((body as { requestedAt: string }).requestedAt)
      : new Date().toISOString();
  recordDevMailboxEvent({ userId, token, resetUrl, requestedAt });
  return NextResponse.json({ ok: true });
}