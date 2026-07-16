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
});
