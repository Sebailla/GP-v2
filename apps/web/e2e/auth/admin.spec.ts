import { test, expect, type Page } from "@playwright/test";

/**
 * Module-3 PR #5 task 5.3 + 5.4 — admin vertical-flow E2E for both
 * locales (en + es).
 *
 * The canonical vertical scenario for module 3 (Phase 5 PR-5) per
 * `openspec/changes/module-3-superadmin/tasks.md` Phase 5 + the
 * spec at `libs/features/auth/docs/admin-flow.feature`:
 *
 *   1. Admin lands on /{locale}/admin/users after sign-in (admin role).
 *   2. GET /admin/users returns the user listing.
 *   3. POST /admin/users/:userId/role flips a target user's role.
 *   4. GET /admin/sessions?userId=... lists the user's sessions.
 *   5. DELETE /admin/sessions/:sessionId revokes a single session.
 *   6. DELETE /admin/sessions/user/:userId revokes every session.
 *   7. A USER role visiting /{locale}/admin/users is redirected
 *      to /{locale}/(app) by apps/web/middleware.ts with the
 *      `?admin=denied` flash.
 *
 * Per `pattern/playwright-per-project-webserver-not-supported`:
 * the spec uses `page.route()` to mock the 5 admin endpoints so the
 * test is independent of a live API. Real wiring happens in dev
 * env. The per-locale split (en + es) is owned by
 * `apps/web/playwright.config.ts`.
 *
 * For the full-green execution prerequisite:
 *   npx playwright install chromium
 *   NODE_ENV=test pnpm dev
 * The apply sandbox does NOT have a chromium binary installed (per
 * the M2 / M3 PR-4 precedent — `playwright_execution_state:
 * authored` in the return envelope). The spec is the
 * production-code contribution; execution happens in the operator's
 * dev environment.
 */

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_USER_EMAIL = "admin@example.com";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_USER_EMAIL = "target@example.com";
const TARGET_SESSION_ID = "33333333-3333-4333-8333-333333333333";

const TEST_LOCALES = ["en", "es"] as const;

type Locale = (typeof TEST_LOCALES)[number];

/**
 * Wire the 5 admin-endpoint `page.route()` mocks. The mocked shapes
 * mirror the controller's response contracts in
 * `apps/api/src/modules/auth/admin.controller.ts`:
 *
 *   - GET    /admin/users?limit=&offset=
 *       → 200 [{id, email, role, createdAt}]
 *   - POST   /admin/users/:userId/role
 *       body: {role: "USER"|"ADMIN"} → 200 {id, email, role, createdAt}
 *   - GET    /admin/sessions?userId=
 *       → 200 [{id, userId, createdAt, lastActiveAt, userAgent, ipAddress}]
 *   - DELETE /admin/sessions/:sessionId → 204
 *   - DELETE /admin/sessions/user/:userId → 204
 */
async function mockAdminEndpoints(page: Page, _locale: Locale): Promise<void> {
  // GET /admin/users — returns the canonical user listing shape.
  await page.route("**/admin/users**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("limit") || url.pathname.endsWith("/admin/users")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: ADMIN_USER_ID,
            email: ADMIN_USER_EMAIL,
            role: "ADMIN",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: TARGET_USER_ID,
            email: TARGET_USER_EMAIL,
            role: "USER",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
        ]),
      });
      return;
    }
    await route.continue();
  });

  // POST /admin/users/:userId/role — flip role assertion. The
  // controller returns 200 + the updated user row (no Set-Cookie
  // for non-self role changes).
  await page.route("**/admin/users/*/role", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    const userId = url.pathname.split("/").slice(-2, -1)[0] ?? TARGET_USER_ID;
    const body = ((): { role?: "USER" | "ADMIN" } => {
      try {
        return JSON.parse(route.request().postData() ?? "{}") as {
          role?: "USER" | "ADMIN";
        };
      } catch {
        return {};
      }
    })();
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: userId,
        email: userId === ADMIN_USER_ID ? ADMIN_USER_EMAIL : TARGET_USER_EMAIL,
        role,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    });
  });

  // GET /admin/sessions?userId= — list sessions.
  await page.route("**/admin/sessions**", async (route, request) => {
    const url = new URL(request.url());
    // The DELETE endpoints share the /admin/sessions path prefix.
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }
    if (!url.searchParams.has("userId")) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: TARGET_SESSION_ID,
          userId: TARGET_USER_ID,
          createdAt: "2026-01-01T00:00:00.000Z",
          lastActiveAt: "2026-01-10T00:00:00.000Z",
          userAgent: "Mozilla/5.0 (e2e)",
          ipAddress: "127.0.0.1",
        },
      ]),
    });
  });

  // DELETE /admin/sessions/:sessionId — single-revoke returns 204.
  await page.route("**/admin/sessions/*", async (route, request) => {
    if (request.method() !== "DELETE") {
      await route.continue();
      return;
    }
    const url = new URL(request.url());
    if (url.pathname.includes("/admin/sessions/user/")) {
      // Handled by the bulk-revoke route below.
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 204,
      body: "",
    });
  });

  // DELETE /admin/sessions/user/:userId — bulk-revoke returns 204.
  await page.route("**/admin/sessions/user/*", async (route, request) => {
    if (request.method() !== "DELETE") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 204,
      body: "",
    });
  });
}

/**
 * Stub the auth-guard that gates the admin route group: the
 * middleware pre-check + the layout's server-side check both
 * resolve to a server component deciding whether the actor is
 * `role: "ADMIN"`. For the e2e we stub the underlying session
 * lookup via a service-worker route on `/auth/session`.
 */
async function stubAdminSession(page: Page, _locale: Locale): Promise<void> {
  await page.route("**/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: ADMIN_USER_ID,
        email: ADMIN_USER_EMAIL,
        role: "ADMIN",
      }),
    });
  });
  await page.route("**/auth/session/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: ADMIN_USER_ID,
        email: ADMIN_USER_EMAIL,
        role: "ADMIN",
      }),
    });
  });
}

for (const locale of TEST_LOCALES) {
  test.describe(`Module-3 PR #5 (task 5.3+5.4) — admin vertical flow [${locale}]`, () => {
    test(`admin walks list-users → change-role → list-sessions → revoke-single → revoke-all`, async ({
      page,
    }) => {
      await mockAdminEndpoints(page, locale);
      await stubAdminSession(page, locale);

      // 1. Admin lands on /admin/users after navigating there.
      await page.goto(`/${locale}/admin/users`);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /users|usuarios/i,
        }),
      ).toBeVisible({ timeout: 5_000 });

      // 2. The UsersTable renders the mocked user rows.
      await expect(page.getByText(ADMIN_USER_EMAIL)).toBeVisible();
      await expect(page.getByText(TARGET_USER_EMAIL)).toBeVisible();

      // 3. Admin opens the target user's detail page + flips their
      // role via the ChangeRoleForm. The mocked POST returns 200 +
      // the updated row.
      await page.goto(
        `/${locale}/admin/users/${TARGET_USER_ID}`,
      );
      await page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => undefined);
      await page
        .getByLabel(/role|rol/i)
        .first()
        .selectOption("ADMIN");
      await page
        .getByRole("button", { name: /save|guardar|update|actualizar/i })
        .first()
        .click();
      await expect(page.getByText(/success|éxito|exito/i).first()).toBeVisible({
        timeout: 5_000,
      });

      // 4. Admin opens the sessions page for the target user. The
      // mocked GET /admin/sessions returns 1 session row.
      await page.goto(`/${locale}/admin/sessions`);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      // Drive the userId form on the sessions page (the table
      // fetches on submit).
      await page
        .getByLabel(/user id|userId/i)
        .first()
        .fill(TARGET_USER_ID);
      await page
        .getByRole("button", {
          name: /list sessions|listar sesiones|search|buscar/i,
        })
        .first()
        .click();
      await expect(page.getByTestId("sessions-table-row").first()).toBeVisible({
        timeout: 5_000,
      });

      // 5. Revoke single — the row's per-row revoke button calls
      // DELETE /admin/sessions/:sessionId which returns 204.
      await page
        .getByRole("button", { name: /revoke|revocar/i })
        .first()
        .click();
      // The success flash renders after the 204.
      await expect(page.getByTestId("revoke-success")).toBeVisible({
        timeout: 5_000,
      });

      // 6. Revoke all — the page's bulk-revoke button (visible
      // after the userId form has a value) calls DELETE
      // /admin/sessions/user/:userId which returns 204.
      await page
        .getByRole("button", { name: /revoke all|revocar todo/i })
        .first()
        .click();
      await expect(page.getByTestId("revoke-all-success")).toBeVisible({
        timeout: 5_000,
      });
    });

    test(`non-admin visiting /admin/users is redirected to /${locale}/(app) with the admin-denied flash`, async ({
      page,
    }) => {
      // For the non-admin path we override the session route to
      // return role=USER.
      await page.route("**/auth/session", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user_non_admin",
            email: "user@example.com",
            role: "USER",
          }),
        });
      });
      await page.route("**/auth/session/**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user_non_admin",
            email: "user@example.com",
            role: "USER",
          }),
        });
      });

      await page.goto(`/${locale}/admin/users`);

      // The middleware pre-check redirects to /{locale}/(app) with
      // the admin-denied flash query param. The literal URL path
      // is /{locale}/(app) per D6 + §1.2 of the runbook.
      await expect(page).toHaveURL(
        new RegExp(`/\\${locale}/\\(app\\)\\?admin=denied`),
        { timeout: 5_000 },
      );
    });
  });
}
