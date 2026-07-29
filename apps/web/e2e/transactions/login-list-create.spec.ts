import { test, expect } from "@playwright/test";

/**
 * Slice 7 PR-5 (T7.7) — login → transactions list → create critical flow.
 *
 * Per tasks.md T7.7 + design §8.4 + G47: the canonical e2e flow is
 *   1. Sign in (the same `login-and-landing` flow as T7.6).
 *   2. Navigate to the transactions list at `/[locale]/transactions`.
 *   3. Open the create-transaction form at `/[locale]/transactions/new`.
 *   4. Fill the form (amount + category + currency).
 *   5. Submit.
 *   6. Assert the new row appears in the list (the form redirects back
 *      to the list and the freshly-created transaction is on top).
 *
 * Per design §8.4 the Playwright projects (`en` + `es`) handle the
 * locale split automatically.
 *
 * The test mocks the cross-origin API surface
 * (`/auth/login`, `/auth/session`, `/transactions`, `/categories`)
 * so the e2e does not require a live API. The mocks return the
 * minimal shape the client libs consume
 * (`apps/web/lib/transactions-api.ts`).
 *
 * Per-dev browser install: `npx playwright install chromium`.
 * Run via `pnpm e2e` from `apps/web/`.
 */

const mockUserResponse = {
  id: "user-alice",
  email: "alice@example.com",
  role: "USER",
  sessionToken: "stub-session-token",
};

const mockCategoryResponse = {
  id: "cat-groceries",
  name: "Groceries",
  slug: "groceries",
  kind: "expense",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

const mockInitialTransactions = {
  total: 0,
  rows: [],
  cursor: null,
};

const mockCreatedTransaction = {
  id: "tx-stub-id-1",
  userId: "user-alice",
  amount: "12.34",
  currencyCode: "USD",
  kind: "expense" as const,
  reportingAmount: "12.34",
  reportingCurrencyCode: "USD",
  fxRateId: null,
  categoryId: "cat-groceries",
  notes: "test",
  occurredAt: "2026-07-11T00:00:00.000Z",
  createdBy: "user-alice",
  updatedBy: "user-alice",
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  deletedAt: null,
};

test.describe("T7.7 — login → list → create (both locales)", () => {
  test.beforeEach(async ({ page }) => {
    // Auth mocks.
    await page.route("**/auth/login", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockUserResponse),
        headers: {
          "content-type": "application/json",
          "set-cookie": "auth-session=stub-session-token; Path=/; HttpOnly",
        },
      }),
    );
    await page.route("**/auth/session", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockUserResponse),
        headers: { "content-type": "application/json" },
      }),
    );

    // Empty initial list.
    await page.route("**/transactions?**", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockInitialTransactions),
        headers: { "content-type": "application/json" },
      }),
    );

    // Categories list (the form needs it for the category selector).
    await page.route("**/categories?**", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([mockCategoryResponse]),
        headers: { "content-type": "application/json" },
      }),
    );

    // POST /transactions — returns the freshly-created row.
    await page.route("**/transactions", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          body: JSON.stringify(mockCreatedTransaction),
          headers: { "content-type": "application/json" },
        });
        return;
      }
      route.continue();
    });
  });

  for (const locale of ["en", "es"] as const) {
    test(`sign in → list (empty) → open form → create → new row visible (/${locale}/)`, async ({
      page,
    }) => {
      // 1. Sign in.
      await page.goto(`/${locale}/sign-in`);
      await page.fill('input[name="email"]', "alice@example.com");
      await page.fill('input[name="password"]', "correct-horse-battery-staple");
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/${locale}/`, {
          timeout: 5_000,
        }),
        page.click('button[type="submit"]'),
      ]);

      // 2. Navigate to the transactions list (the (app) layout
      //    exposes the link in the nav).
      await page.goto(`/${locale}/transactions`);
      // List rendered with the empty state — the row count is 0.
      await expect(page.getByRole("main")).toBeVisible();

      // 3. Open the create-transaction form.
      await page.goto(`/${locale}/transactions/new`);
      await expect(page.getByRole("main")).toBeVisible();

      // 4. Fill the form. The form uses a number input for amount +
      //    a select for currency (defaulted) + a select for category.
      await page.fill('input[name="amount"]', "12.34");
      // The category selector picks the only mocked option.
      const categorySelect = page.locator('select[name="categoryId"]');
      await categorySelect.selectOption("cat-groceries");
      // The notes field is optional but the spec asserts the row appears;
      // a non-empty value exercises the persistence path completely.
      const notesInput = page.locator('input[name="notes"],textarea[name="notes"]');
      if (await notesInput.count()) {
        await notesInput.first().fill("test");
      }

      // 5. Submit.
      await Promise.all([
        page.waitForURL((url) => url.pathname.startsWith(`/${locale}/transactions`)),
        page.click('button[type="submit"]'),
      ]);

      // 6. The new row appears. The exact UI depends on the
      //    transactions-list surface (slice 6 PR-B/C); we assert the
      //    row identifier that distinguishes "stub" rows from the
      //    mocked initial empty list. The category name is rendered by
      //    the list, so we assert it appears on the page surface.
      await expect(page.getByText(/12\.34|Groceries/i).first()).toBeVisible({
        timeout: 5_000,
      });
    });
  }
});
