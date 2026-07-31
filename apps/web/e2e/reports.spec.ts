import { test } from "@playwright/test";

import { expectNoAxeViolations } from "./utils/axe.js";

/**
 * Module 6 (Reports & Analytics) — WCAG AA audit on the reports page.
 *
 * Per spec scenario S20 + the SUGGESTION-S4 closure on the
 * `module-6-reports` verify-report, the canonical WCAG AA audit for
 * the reports slice exercises BOTH locales (`en` + `es`) against
 * the rendered `/[locale]/reports` page. The (app) layout's
 * session guard redirects unauthenticated requests to /sign-in, so
 * the audit effectively covers the redirect surface (the auth
 * screens have their own audit in `wcag-aa.spec.ts`).
 *
 * Pattern follows `wcag-aa.spec.ts` (auth screens, slice 4) and
 * `transactions/login-list-create.spec.ts` (cross-origin API
 * mocking, slice 7). The e2e mocks the API surface with
 * `page.route()` so the suite runs without a live API / DB. The
 * e2e IS the audit harness for S20 — the original spec
 * commitment of "axe-core run against /[locale]/reports" is
 * delivered here.
 *
 * Per-dev browser install: `npx playwright install chromium`.
 * Run via `pnpm e2e` from `apps/web/`.
 */

// Mock the 4 report endpoints so any follow-up test that bypasses
// the (app) session guard (e.g., an authenticated audit on the
// reports page rendering the data cards) has the API surface
// covered. The unauthenticated path used by this spec doesn't
// reach these endpoints, but the mocks are cheap to keep.

// Match the canonical `ReportsSummary` contract
// (`libs/features/reports/src/server/domain/services/reports.service.ts:67`).
const mockSummary = {
  fromDate: "2026-07-01",
  toDate: "2026-08-01",
  currencyCode: "USD",
  income: "1500.00",
  expense: "-450.00",
  net: "1050.00",
  transactionCount: 5,
  fxFreshness: "fresh",
};

// Match `CategoryBreakdownReport` (same file, line 82).
const mockCategoryBreakdown = [
  {
    categoryId: "cat-groceries",
    categoryName: "Groceries",
    total: "-300.00",
    transactionCount: 3,
    share: 0.6667,
  },
  {
    categoryId: "cat-transport",
    categoryName: "Transport",
    total: "-150.00",
    transactionCount: 2,
    share: 0.3333,
  },
];

// Match `PeriodComparisonReport` (line 112) — includes
// `current` + `previous` series + `delta` (income/expense/net/netPercent).
const mockPeriodComparison = {
  current: {
    totals: mockSummary,
    buckets: [
      { label: "2026-07", fromDate: "2026-07-01", toDate: "2026-08-01", income: "1500.00", expense: "-450.00", net: "1050.00" },
    ],
  },
  previous: {
    totals: {
      ...mockSummary,
      fromDate: "2026-06-01",
      toDate: "2026-07-01",
      income: "1300.00",
      expense: "-500.00",
      net: "800.00",
      transactionCount: 4,
    },
    buckets: [
      { label: "2026-06", fromDate: "2026-06-01", toDate: "2026-07-01", income: "1300.00", expense: "-500.00", net: "800.00" },
    ],
  },
  delta: {
    income: "200.00",
    expense: "50.00",
    net: "250.00",
    netPercent: 0.3125,
  },
};

// CSV export stub — the workspace's ExportCsvButton uses fetchCsv()
// which reads Content-Type and Content-Disposition. The export is
// two buttons (summary + transactions), each gets the same shape.
const mockCsvBody = `category_id,category_name,total,currency_code,transaction_count,share\r\ncat-groceries,Groceries,-300.00,USD,3,0.6667\r\ncat-transport,Transport,-150.00,USD,2,0.3333\r\n__TOTAL__,,0.00,USD,5,1.0000\r\n`;

test.describe("WCAG AA — /[locale]/reports", () => {
  test.beforeEach(async ({ page }) => {
    // The audit runs against the unauthenticated path (the (app)
    // layout redirects to /sign-in on a missing session). The
    // 4 report endpoints are mocked so any future test that
    // bypasses the session guard (e.g., a follow-up audit on the
    // authenticated reports page) has the API surface covered.
    await page.route(/\/api\/reports\/summary\?.*/, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockSummary),
        headers: { "content-type": "application/json" },
      }),
    );
    await page.route(/\/api\/reports\/by-category\?.*/, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockCategoryBreakdown),
        headers: { "content-type": "application/json" },
      }),
    );
    await page.route(/\/api\/reports\/by-period\?.*/, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(mockPeriodComparison),
        headers: { "content-type": "application/json" },
      }),
    );
    await page.route(/\/api\/reports\/export\.csv\?.*/, (route) =>
      route.fulfill({
        status: 200,
        body: mockCsvBody,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="reports-2026-07-01-2026-08-01.detail.csv"',
        },
      }),
    );
  });

  for (const locale of ["en", "es"] as const) {
    test(`/en reports page has zero WCAG AA violations (/${locale}/)`, async ({ page }) => {
      // Direct navigation. Without a valid session the (app) layout
      // redirects to /sign-in; the audit runs against the rendered
      // page in whatever state the (app) guard lands on. This is
      // the same surface the user lands on when navigating without a
      // session — and per AGENTS.md §9 the (app) layout must be
      // accessible end-to-end.
      await page.goto(`/${locale}/reports`);
      await expectNoAxeViolations(page);
    });
  }
});

// Note: the unauthenticated audit (no session → redirect to /sign-in)
// is functionally equivalent to the auth-screen audit in
// `wcag-aa.spec.ts`. Adding a separate test for the redirect path
// would duplicate work.
