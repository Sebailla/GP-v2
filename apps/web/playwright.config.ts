import type { PlaywrightTestConfig } from "@playwright/test";

/**
 * Playwright config — slice 4 + slice 6 + slice 7 PR-5 e2e suite.
 *
 * Project naming follows design §8.4 + tasks.md T7.5: the canonical
 * names are `en` + `es` (matching the next-intl locale codes), so the
 * two-project split renders reports per-locale. The locale-prefixed
 * routing (T4.3) means each project visits `/{locale}/<page>` and
 * asserts the locale-specific copy.
 *
 * History: the slice 4 config used `chromium-en` + `chromium-es`;
 * slice 7 PR-5 renamed to `en` + `es`. The locale values stayed
 * (en-US + es-ES) so the assertion surface is unchanged.
 *
 * WebServer strategy (R-PF-11 must-3 wiring, production-foundation):
 *   - The `en` and `es` projects spin up the local Next.js dev server
 *     via `pnpm dev`. The dev server is started by the `dev:test-server`
 *     npm script (defined in package.json), which is a thin wrapper
 *     around `pnpm dev` that NOOPs when `SMOKE_API_URL` is set.
 *   - The `smoke` project runs against the deployed staging API + web
 *     (`SMOKE_API_URL` + `SMOKE_WEB_URL`). The `dev:test-server` script
 *     detects `SMOKE_API_URL`, prints "skipping local dev server", and
 *     exits 0 — Playwright probes the configured URL, the probe fails
 *     (no local server), and the `reuseExistingServer: true` for non-CI
 *     makes Playwright skip the probe. The smoke specs hit the
 *     deployed stack via `request.newContext({ baseURL })` and
 *     `page.goto(SMOKE_WEB_URL + path)` directly.
 *
 *     Why this shape instead of per-project `webServer`:
 *     Playwright's `Project` type does NOT support a `webServer`
 *     field. The webServer lives at the TestConfig level. To make it
 *     conditional on the project, we put the condition INSIDE the
 *     server's `command` wrapper — the command exits 0 (no server)
 *     when SMOKE_API_URL is set, and `pnpm dev` otherwise.
 *
 *     `reuseExistingServer: !process.env.CI` means: locally we
 *     expect a running server; in CI we always start fresh. The
 *     smoke project's probe is short-circuited by the NOOP wrapper
 *     so the 120s timeout never fires — Playwright falls back to
 *     "server not started, expect failure" which is the desired
 *     behavior for smoke (the page-level goto's talk directly to
 *     SMOKE_WEB_URL, not localhost).
 *
 * The e2e suite is NOT wired into `pnpm turbo run test` — the dev
 * server adds significant CI time and the e2e suite is best-effort.
 * Run via `pnpm e2e` from `apps/web/`. Operators running the smoke
 * locally MUST export SMOKE_API_URL + SMOKE_WEB_URL before invoking
 * `pnpm --filter web exec playwright test --project=smoke`.
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
      name: "en",
      use: {
        browserName: "chromium",
        locale: "en-US",
      },
    },
    {
      name: "es",
      use: {
        browserName: "chromium",
        locale: "es-ES",
      },
    },
    {
      name: "smoke",
      use: {
        browserName: "chromium",
        locale: "en-US",
        baseURL: process.env["SMOKE_WEB_URL"] ?? "http://localhost:3000",
      },
    },
  ],
  webServer: {
    command: "pnpm dev:test-server",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
};

export default config;
