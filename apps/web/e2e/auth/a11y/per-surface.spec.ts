import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { WCAG_TAGS } from "../../utils/axe.js";

/**
 * Module-2 PR #5 task 5.3 — per-surface axe-core WCAG AA audit.
 *
 * Per `openspec/changes/module-2-public-auth/design.md` §6 (WCAG AA via
 * Playwright + axe-core) + `tasks.md` 5.3: each critical auth surface
 * gets its own focused a11y spec so a regression in one surface does
 * not get buried under the others.
 *
 * The audits use the per-project locale split (`en` + `es`) — the
 * `playwright.config.ts` projects own the locale-specific tests
 * automatically. The spec iterates over the surfaces WITHIN each
 * project so the same suite runs twice (once en, once es).
 *
 * Severity model: the suite asserts zero serious / critical
 * violations per surface. Lower-severity findings are NOT a gate
 * (per AGENTS.md §9 — WCAG AA per @axe-core/playwright audit). The
 * helper that follows captures the full violation array and prints a
 * summary so a regression is debuggable from the report.
 *
 * Per the brief: ARIA labels come from `useTranslations()` /
 * next-intl (apps/web/messages/{en,es}.json). The asserts only check
 * that the audit is clean — the i18n coverage lives in the
 * `i18n-coverage.test.tsx` Vitest suite (the surface-level proof).
 */

const SERIOUS_OR_CRITICAL = ["serious", "critical"] as const;

const SURFACES = [
  {
    name: "sign-in",
    path: (locale: "en" | "es") => `/${locale}/sign-in`,
    selectorsToSeed: async () => undefined,
  },
  {
    name: "sign-up",
    path: (locale: "en" | "es") => `/${locale}/sign-up`,
    selectorsToSeed: async () => undefined,
  },
  {
    name: "forgot-password",
    path: (locale: "en" | "es") => `/${locale}/forgot-password`,
    selectorsToSeed: async () => undefined,
  },
  {
    name: "reset-password",
    // Uses a synthetic token (64 hex chars) to mirror the real
    // crypto.randomBytes(32).toString("hex") shape; the schema
    // accepts z.string().min(32).max(128).
    path: (locale: "en" | "es") =>
      `/${locale}/reset-password/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`,
    selectorsToSeed: async () => undefined,
  },
] as const;

const LOCALES = ["en", "es"] as const;

/**
 * Surface any serious or critical violations. Lower-severity
 * findings are NOT a gate.
 */
function summarizeSeriousOrCritical(
  violations: ReadonlyArray<{ id: string; impact?: string | null; help: string; nodes: ReadonlyArray<unknown> }>,
): string {
  const serious = violations.filter(
    (v) => (v.impact ?? undefined) !== undefined && SERIOUS_OR_CRITICAL.includes(v.impact as "serious" | "critical"),
  );
  if (serious.length === 0) return "0 serious/critical";
  return serious
    .map((v) => `  - [${v.impact}] ${v.id} (${v.help}) — ${v.nodes.length} nodes`)
    .join("\n");
}

for (const locale of LOCALES) {
  test.describe(`[${locale}] a11y — auth surfaces`, () => {
    for (const surface of SURFACES) {
      test(`${surface.name} page passes WCAG AA (no serious / critical)`, async ({
        page,
      }) => {
        await page.goto(surface.path(locale));
        await surface.selectorsToSeed();
        // Wait for the page to settle — Playwright's axe-core
        // integration runs against whatever has rendered so far.
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

        const results = await new AxeBuilder({ page })
          .withTags([...WCAG_TAGS])
          .analyze();

        const summary = summarizeSeriousOrCritical(results.violations);
        expect(summary, summary).toBe("0 serious/critical");
      });
    }
  });
}
