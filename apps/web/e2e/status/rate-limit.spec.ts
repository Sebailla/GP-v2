import { test, expect, request as playwrightRequest } from "@playwright/test";

/**
 * R-PF-11 MUST-3 — rate-limit 429 + Retry-After assertion.
 *
 * The deploy workflow smoke posts against the deployed web only
 * (`Smoke /status page` in deploy-staging.yml). R-PF-11 also requires
 * a rate-limit assertion: hit the API's `POST /auth/login` with a
 * burst of identical emails and confirm the response is 429 with a
 * non-empty `Retry-After` header.
 *
 * Architecture (per design §4.2.3 + §4.3): the web Next.js app does
 * NOT proxy `/auth/login` — it talks to the auth API as a separate
 * cross-origin service from the Next.js client. `apps/web/app/api/*`
 * route handlers proxy only `/healthz`, `/readyz` and `/status`. So
 * `/api/auth/login` would not exist; the rate-limit MUST be asserted
 * against the API directly.
 *
 * The `smoke` Playwright project (config in
 * `apps/web/playwright.config.ts`) is the only project allowed to
 * point at the deployed env. The dedicated env var `SMOKE_API_URL` is
 * set by the deploy workflow to the deployed API URL; this test
 * asserts on that URL. Without the env var, the test auto-skips so it
 * stays silent in local dev + the `en`/`es` runs.
 */
const RATE_LIMIT_TARGET_COUNT = 12;
const SHARED_EMAIL = `smoke-ratelimit-${Date.now()}@example.com`;

test.describe("R-PF-11 MUST-3 — auth login rate-limit (smoke project only)", () => {
  test.skip(
    process.env["SMOKE_API_URL"] === undefined,
    "smoke-only: requires SMOKE_API_URL (deploy workflow sets it to STAGING_PUBLIC_API_URL)",
  );

  test("12-request login burst ends in 429 with Retry-After >= 1", async () => {
    const smokeBaseUrl = process.env["SMOKE_API_URL"] ?? "http://localhost:3001";
    const ctx = await playwrightRequest.newContext({ baseURL: smokeBaseUrl });
    try {
      let last: Awaited<ReturnType<typeof ctx.post>> | null = null;
      for (let i = 0; i < RATE_LIMIT_TARGET_COUNT; i += 1) {
        last = await ctx.post("/auth/login", {
          data: { email: SHARED_EMAIL, password: "StrongP@ss123" },
        });
      }
      expect(last).not.toBeNull();
      if (last === null) {
        throw new Error("unreachable: 12 requests must yield a final response");
      }
      expect(last.status()).toBe(429);
      const headerMap = last.headers();
      const retryAfterHeader =
        headerMap["retry-after"] ??
        headerMap["Retry-After"] ??
        Object.entries(headerMap).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
      const retryAfter = Number(retryAfterHeader ?? 0);
      expect(Number.isFinite(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.dispose();
    }
  });
});
