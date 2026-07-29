import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Module-4 Phase 3 (PR #3) task 3.8 — per-surface axe-core WCAG AA
 * audit for the new audit-log surface.
 *
 * Per `openspec/changes/module-4-privacy/design.md` §6 +
 * AGENTS.md §9: every critical surface ships with a per-surface
 * WCAG AA audit via Playwright + `@axe-core/playwright`. Zero
 * serious / critical findings are required per the slice-4
 * baseline (carry-forward from M3 PR #4).
 *
 * The audit runs per locale project (en + es) — the per-project
 * locale split is owned by `apps/web/playwright.config.ts`.
 *
 * **Mocking strategy.** The audit page calls GET /admin/audit on
 * mount via `AuditLogTable` (which calls `listAdminAuditEvents`).
 * The `next.config.js` rewrites those paths to the API at
 * runtime — in the test harness there is no live API, so we
 * route-mock the audit endpoint with the minimum shape the page
 * needs to render (2 audit events). This is the
 * `pattern/playwright-per-project-webserver-not-supported`
 * approach: the spec file is for ONE project per run; we mock
 * the API, not the server.
 *
 * **Note on execution state.** The apply sandbox does NOT have
 * a chromium binary installed (see `playwright_execution_state`
 * in the apply-progress return envelope — carry-forward from
 * M2/M3). The spec is authored here; execution happens against
 * the operator's local dev environment where
 * `npx playwright install chromium` has run. The dev environment
 * is wired via `pnpm dev` (the `webServer` block in
 * `playwright.config.ts`).
 */

const SERIOUS_OR_CRITICAL = ["serious", "critical"] as const;

const AUDIT_SURFACES = [
  {
    name: "audit-log",
    path: (locale: "en" | "es") => `/${locale}/admin/audit`,
    /**
     * Seed the page with a fixture that exercises BOTH the table
     * render path (2 audit rows) AND the HMAC ipAddress column.
     * The second row has null ipAddress + null userAgent so the
     * "—" em-dash placeholder path is also audited.
     */
    seedRoute: async (page: Page, _locale: "en" | "es") => {
      await page.route("**/admin/audit**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "evt-1",
              actorId: "11111111-1111-4111-8111-111111111111",
              targetId: "22222222-2222-4222-8222-222222222222",
              action: "REVOKE_SESSION",
              createdAt: "2026-01-15T10:00:00.000Z",
              metadata: { sessionId: "session-1" },
              ipAddress:
                "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
              userAgent: "Mozilla/5.0 (e2e)",
            },
            {
              id: "evt-2",
              actorId: "33333333-3333-4333-8333-333333333333",
              targetId: "44444444-4444-4444-8444-444444444444",
              action: "CHANGE_ROLE",
              createdAt: "2026-01-16T11:00:00.000Z",
              metadata: { from: "USER", to: "ADMIN" },
              ipAddress: null,
              userAgent: null,
            },
          ]),
        });
      });
    },
  },
  {
    name: "audit-log-empty",
    path: (locale: "en" | "es") => `/${locale}/admin/audit`,
    /**
     * Empty-state path: the API returns `[]` so the page renders
     * the CTA + helpful copy. This is the success-empty state
     * in AGENTS.md §9's 5-state contract.
     */
    seedRoute: async (page: Page, _locale: "en" | "es") => {
      await page.route("**/admin/audit**", async (route) => {
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
  test.describe(`[${locale}] a11y — audit log surfaces (M4 Phase 3 PR #3 task 3.8)`, () => {
    for (const surface of AUDIT_SURFACES) {
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
