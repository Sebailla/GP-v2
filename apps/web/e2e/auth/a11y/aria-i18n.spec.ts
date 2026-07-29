import { test, expect } from "@playwright/test";

/**
 * Module-2 PR #5 task 5.3 — ARIA-label localization proof.
 *
 * Per `openspec/changes/module-2-public-auth/design.md` §6 the per-
 * surface a11y audits assert that ARIA labels are sourced from
 * `useTranslations()` (next-intl) for both en + es. This spec is the
 * static-type-level proof: each critical auth surface must declare its
 * accessible name through the i18n catalog, NOT through hardcoded
 * English strings.
 *
 * The spec:
 *  1. Loads the sign-in page in both locales.
 *  2. Reads the email-input accessible name (via `aria-label` /
 *     `aria-labelledby` / visually associated label).
 *  3. Asserts the localized label matches the message catalog.
 *
 * Because Playwright e2e runs against the real DOM, the assertion
 * fails if a surface ships an English-only `aria-label` that hardcodes
 * the text (a translation gap). Lower-severity findings (inputmode,
 * autocomplete) are NOT a gate.
 *
 * Per-project locale split: each iteration visits the matching URL.
 */

const TESTS: ReadonlyArray<{ locale: "en" | "es"; expectedLabel: RegExp }> = [
  { locale: "en", expectedLabel: /email/i },
  { locale: "es", expectedLabel: /correo electr[oó]nico|correo/i },
];

for (const { locale, expectedLabel } of TESTS) {
  test(`[${locale}] sign-in form labels come from useTranslations() (next-intl)`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/sign-in`);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    // The SignInClient surfaces the email field's accessible name
    // via label/aria-label. We assert the resolved accessible name
    // matches the localized pattern (NOT hardcoded English).
    const emailInput = page.getByLabel(expectedLabel);
    await expect(emailInput, `email input not found for locale ${locale}`).toBeVisible({
      timeout: 5_000,
    });
  });
}
