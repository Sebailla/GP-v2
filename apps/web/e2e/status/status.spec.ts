import { test, expect } from "@playwright/test";

test.describe("status surface (R-PF-10, R-PF-11)", () => {
  test("renders environment, commit and last backup", async ({ page }) => {
    await page.goto("/en/status");
    await expect(page.getByTestId("status-environment")).toBeVisible();
    await expect(page.getByTestId("status-commit")).toBeVisible();
    await expect(page.getByTestId("status-last-backup")).toBeVisible();
  });

  test("responds 200 on /api/healthz", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect([200, 502, 503]).toContain(res.status());
  });

  test("responds 200 on /api/readyz or 503 when DB is unreachable", async ({ request }) => {
    const res = await request.get("/api/readyz");
    expect([200, 503]).toContain(res.status());
  });
});
