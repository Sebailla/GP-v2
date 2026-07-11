import type { PlaywrightTestConfig } from "@playwright/test";

/**
 * Playwright config — slice 4 batch 4e (T4.13 WCAG AA e2e + T4.15
 * responsive e2e). Per design §8.4 + tasks.md T4.13, the slice 4 e2e
 * suite runs in two projects: `chromium-en` + `chromium-es`. The
 * locale-prefixed routing (T4.3) means each project visits
 * `/{locale}/<page>` and asserts the locale-specific copy.
 *
 * The dev server (`pnpm dev`) is started automatically by Playwright
 * via `webServer`. The e2e suite is NOT wired into the `pnpm turbo
 * run test` pipeline — the dev server would add significant CI time
 * and the slice 4 e2e is best-effort. Run via `pnpm e2e` from
 * `apps/web/`.
 *
 * Per the brief, the actual `chromium` browser binary is a
 * per-developer step (`npx playwright install chromium`). The test
 * code is wired + the runner is wired; the browser binary install is
 * a local step.
 */
const config: PlaywrightTestConfig = {
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : (undefined as unknown as number),
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-en",
      use: {
        browserName: "chromium",
        locale: "en-US",
      },
    },
    {
      name: "chromium-es",
      use: {
        browserName: "chromium",
        locale: "es-ES",
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
};

export default config;
