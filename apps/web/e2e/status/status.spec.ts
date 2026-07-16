import { test, expect } from "@playwright/test";

/**
 * Smoke surface (R-PF-10, R-PF-11).
 *
 * The status page is reachable WITHOUT a session. The proxy route
 * /api/status forwards server-side to PUBLIC_API_URL/status, which
 * returns the JSON snapshot the page renders. /api/healthz is a
 * liveness probe (does NOT touch the DB); /api/readyz is the
 * readiness probe (requires the DB). The proxy returns 200 when the
 * upstream returns 200; it returns 502 when the upstream is
 * unreachable. The smoke asserts 200 from the proxy because the
 * staging web deploy also deploys the API; if the API is unhealthy
 * at the time of the smoke, the deploy is a failed deploy.
 */
test.describe("status surface (R-PF-10, R-PF-11)", () => {
  test("renders environment, commit and last backup", async ({ page }) => {
    await page.goto("/en/status");
    await expect(page.getByTestId("status-environment")).toBeVisible();
    await expect(page.getByTestId("status-commit")).toBeVisible();
    await expect(page.getByTestId("status-last-backup")).toBeVisible();
  });

  test("responds 200 on /api/healthz", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.status()).toBe(200);
  });

  test("responds 200 on /api/readyz", async ({ request }) => {
    const res = await request.get("/api/readyz");
    expect(res.status()).toBe(200);
  });

  test("rate-limit guard returns 429 + Retry-After on the 11th login attempt (R-PF-8 + R-PF-11)", async ({
    request,
  }) => {
    // R-PF-8 sets auth:login to 10 / 600s. The 11th attempt from the
    // same IP within the window must return 429 with a Retry-After
    // header. The previous tests in this file all use the SAME IP
    // (Playwright's `request` fixture shares one connection pool), so
    // we POST sequentially without skipping — the FIRST request in
    // this test should land a 429 because the prior 10 (from the
    // status + healthz + readyz tests above) also count if they hit
    // the same IP. To make the assertion deterministic we issue 12
    // requests and assert the LAST one is 429 + Retry-After ≥ 1.
    let lastStatus = 0;
    let lastRetryAfter = "";
    for (let i = 0; i < 12; i += 1) {
      const res = await request.post("/api/auth/login", {
        data: { email: `smoke-${i}@example.com`, password: "StrongP@ss123" },
      });
      lastStatus = res.status();
      lastRetryAfter = res.headers()["retry-after"] ?? "";
    }
    expect(lastStatus).toBe(429);
    expect(Number(lastRetryAfter)).toBeGreaterThanOrEqual(1);
  });
});
