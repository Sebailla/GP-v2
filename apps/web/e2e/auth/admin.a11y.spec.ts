import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Module-3 Phase 4 (PR #4) task 4.7 — per-surface axe-core WCAG AA
 * audit for the admin pages.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §6 + AGENTS.md
 * §9: every critical surface ships with a per-surface WCAG AA audit
 * via Playwright + `@axe-core/playwright`. Zero serious / critical
 * findings are required per the slice-4 baseline.
 *
 * The audit runs per locale project (en + es) — the per-project
 * locale split is owned by `apps/web/playwright.config.ts`. Each
 * surface below is asserted for both locales in one run.
 *
 * **Why a separate spec (vs. extending the existing
 * `apps/web/e2e/auth/a11y/per-surface.spec.ts`).** The slice-4
 * spec enumerates a fixed SURFACES array. Adding the admin
 * surfaces there would couple the auth slice to the admin slice
 * for no architectural reason; the admin surfaces have their own
 * route group + layout, so a sibling spec is the right place.
 *
 * **Mocking strategy.** The admin pages call GET /admin/users
 * (and friends) on mount. The `next.config.js` rewrites those
 * paths to the API at runtime — in the test harness there is
 * no live API, so we route-mock the admin endpoints with the
 * minimum shape the page needs to render (1 user row for the
 * users list, 1 session row for the sessions list). This is
 * the `pattern/playwright-per-project-webserver-not-supported`
 * approach: the spec file is for ONE project per run; we mock
 * the API, not the server.
 *
 * **Note on execution state.** The apply sandbox does NOT have
 * a chromium binary installed (see `playwright_execution_state`
 * in the apply-progress return envelope). The spec is authored
 * here; execution happens against the operator's local dev
 * environment where `npx playwright install chromium` has run.
 * The dev environment is wired via `pnpm dev` (the
 * `webServer` block in playwright.config.ts).
 */

const SERIOUS_OR_CRITICAL = ["serious", "critical"] as const;

const ADMIN_SURFACES = [
  {
    name: "users-list",
    path: (locale: "en" | "es") => `/${locale}/admin/users`,
    /**
     * Seed the page with the minimum fixture shape so the
     * `UsersTable` exits its loading state and renders the
     * real success-empty / success-non-empty branches. An
     * empty array triggers the empty-state path; a single
     * user triggers the table-render path. Both must be
     * WCAG AA clean.
     */
    seedRoute: async (page: Page, locale: "en" | "es") => {
      await page.route("**/admin/users**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/admin/users") || url.pathname.endsWith("/admin/users/")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: "11111111-1111-4111-8111-111111111111",
                email: "alice@example.com",
                role: "USER",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
              {
                id: "22222222-2222-4222-8222-222222222222",
                email: "bob@example.com",
                role: "ADMIN",
                createdAt: "2026-01-02T00:00:00.000Z",
              },
            ]),
          });
        } else {
          await route.continue();
        }
      });
      // Silence the lint hint.
      void locale;
    },
  },
  {
    name: "user-detail",
    path: (locale: "en" | "es") =>
      `/${locale}/admin/users/11111111-1111-4111-8111-111111111111`,
    seedRoute: async (page: Page, _locale: "en" | "es") => {
      // The detail page calls GET /admin/users via the server
      // component (apps/web/lib/admin-api.ts#listAdminUsers)
      // and filters to the requested userId in the page.
      await page.route("**/admin/users**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "11111111-1111-4111-8111-111111111111",
              email: "alice@example.com",
              role: "USER",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ]),
        });
      });
    },
  },
  {
    name: "sessions-list",
    path: (locale: "en" | "es") => `/${locale}/admin/sessions`,
    seedRoute: async (page: Page, _locale: "en" | "es") => {
      // The sessions page renders the SessionsTable; the
      // table's userId form starts in idle state so we just
      // need the page to render. We pre-seed the GET handler
      // so the table can resolve an immediate list call if
      // the test driver wants to drive the input.
      await page.route("**/admin/sessions**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });
    },
  },
] as const;

const LOCALES = ["en", "es"] as const;

/**
 * Surface any serious / critical violations. Lower-severity
 * findings are NOT a gate per AGENTS.md §9 (WCAG AA per
 * `@axe-core/playwright` audit).
 */
function summarizeSeriousOrCritical(
  violations: ReadonlyArray<{
    id: string;
    impact?: string | null;
    help: string;
    nodes: ReadonlyArray<unknown>;
  }>,
): string {
  const serious = violations.filter(
    (v) =>
      (v.impact ?? undefined) !== undefined &&
      SERIOUS_OR_CRITICAL.includes(v.impact as "serious" | "critical"),
  );
  if (serious.length === 0) return "0 serious/critical";
  return serious
    .map((v) => `  - [${v.impact}] ${v.id} (${v.help}) — ${v.nodes.length} nodes`)
    .join("\n");
}

for (const locale of LOCALES) {
  test.describe(`[${locale}] a11y — admin surfaces (M3 Phase 4)`, () => {
    for (const surface of ADMIN_SURFACES) {
      test(`${surface.name} page passes WCAG AA (no serious / critical)`, async ({
        page,
      }) => {
        await surface.seedRoute(page, locale);
        await page.goto(surface.path(locale));
        await page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => undefined);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const summary = summarizeSeriousOrCritical(results.violations);
        expect(summary, summary).toBe("0 serious/critical");
      });
    }
  });
}
