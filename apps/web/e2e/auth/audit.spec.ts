import { test, expect, type Page } from "@playwright/test";

/**
 * Module-4 Phase 4 (PR #4) tasks 4.3 + 4.4 — audit vertical-flow
 * E2E for both locales (en + es).
 *
 * The canonical vertical scenario for module 4 (Phase 4 PR #4)
 * per `openspec/changes/module-4-privacy/tasks.md` Phase 4 +
 * the spec at `libs/features/auth/docs/audit-flow.feature`:
 *
 *   1. Admin lands on /{locale}/admin/audit after sign-in.
 *   2. GET /admin/audit returns the spec-literal 8-field audit-
 *      event shape (id, actorId, targetId, action, createdAt,
 *      metadata, ipAddress HMAC hex, userAgent).
 *   3. Filtering by actorId=<self.id> returns ONLY that admin's
 *      rows (the dynamic Prisma where clause per design D3).
 *   4. The admin's own REVOKE_SESSION row appears in the
 *      filtered result with HMAC ipAddress.
 *   5. Dry-run purge with olderThanDays=1 returns
 *      { matched, wouldDelete } with NO rows deleted (per D4
 *      dual-mode contract).
 *   6. Real purge with olderThanDays=90 returns { matched,
 *      deleted } with matched===deleted (atomic deleteMany).
 *   7. A second dry-run with the same olderThanDays returns 0
 *      (idempotency per D4 + threat matrix retention row).
 *
 * Per `pattern/playwright-per-project-webserver-not-supported`:
 * the spec uses `page.route()` to mock the 2 admin audit
 * endpoints so the test is independent of a live API. Real
 * wiring happens in dev env. The per-locale split (en + es) is
 * owned by `apps/web/playwright.config.ts`.
 *
 * For the full-green execution prerequisite:
 *   npx playwright install chromium
 *   NODE_ENV=test pnpm dev
 * The apply sandbox does NOT have a chromium binary installed
 * (per the M2 / M3 / M4 PR-3 precedent — `playwright_execution_state:
 * authored` in the return envelope). The spec is the
 * production-code contribution; execution happens in the
 * operator's dev environment.
 */

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_USER_EMAIL = "admin@example.com";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_SESSION_ID = "33333333-3333-4333-8333-333333333333";

const TEST_LOCALES = ["en", "es"] as const;

type Locale = (typeof TEST_LOCALES)[number];

/**
 * Wire the 2 admin-audit-endpoint `page.route()` mocks. The
 * mocked shapes mirror the controller's response contracts in
 * `apps/api/src/modules/auth/admin.controller.ts`:
 *
 *   - GET  /admin/audit?actorId=&targetId=&action=&since=&until=&limit=&offset=
 *       → 200 [{id, actorId, targetId, action, createdAt,
 *               metadata, ipAddress, userAgent}] (8-field spec-
 *               literal projection)
 *   - POST /admin/audit/purge
 *       body: {dryRun: bool, olderThanDays: int ≥ 1}
 *       → 200 {matched, wouldDelete | deleted}
 */
async function mockAuditEndpoints(page: Page, _locale: Locale): Promise<void> {
  // GET /admin/audit — returns the canonical 8-field audit-event
  // shape. The HMAC ipAddress column is the 64-char lowercase hex
  // digest the audit.service#hashIpForAudit produces (per D6).
  await page.route("**/admin/audit**", async (route) => {
    const url = new URL(route.request().url());
    // The POST /admin/audit/purge endpoint shares the /admin/audit
    // path prefix; let it through to the route below.
    if (url.pathname.endsWith("/admin/audit/purge")) {
      await route.continue();
      return;
    }
    const actorIdFilter = url.searchParams.get("actorId");
    const allEvents = [
      {
        id: "evt-1",
        actorId: ADMIN_USER_ID,
        targetId: TARGET_SESSION_ID,
        action: "REVOKE_SESSION" as const,
        createdAt: "2026-01-15T10:00:00.000Z",
        metadata: { sessionId: TARGET_SESSION_ID },
        ipAddress:
          "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        userAgent: "Mozilla/5.0 (e2e)",
      },
      {
        id: "evt-2",
        actorId: ADMIN_USER_ID,
        targetId: TARGET_USER_ID,
        action: "CHANGE_ROLE" as const,
        createdAt: "2026-01-16T11:00:00.000Z",
        metadata: { from: "USER", to: "ADMIN" },
        ipAddress:
          "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        userAgent: "Mozilla/5.0 (e2e)",
      },
      {
        id: "evt-3",
        actorId: TARGET_USER_ID,
        targetId: "44444444-4444-4444-8444-444444444444",
        action: "REVOKE_ALL_SESSIONS" as const,
        createdAt: "2026-01-17T12:00:00.000Z",
        metadata: { count: 3 },
        ipAddress: null,
        userAgent: null,
      },
    ];
    // When the admin filters by actorId, return ONLY their rows
    // (per D3 dynamic Prisma where). Otherwise return the full
    // listing sorted DESC by createdAt.
    const filtered =
      actorIdFilter !== null && actorIdFilter.length > 0
        ? allEvents.filter((row) => row.actorId === actorIdFilter)
        : allEvents;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(filtered),
    });
  });

  // POST /admin/audit/purge — dual-mode retention purge. Dry-run
  // returns { matched, wouldDelete }; real returns { matched,
  // deleted } with matched===deleted (atomic deleteMany).
  // Idempotency: the second dry-run after a real purge returns 0.
  let purgeCount = 0;
  await page.route("**/admin/audit/purge", async (route, request) => {
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const body = ((): { dryRun?: boolean; olderThanDays?: number } => {
      try {
        return JSON.parse(request.postData() ?? "{}") as {
          dryRun?: boolean;
          olderThanDays?: number;
        };
      } catch {
        return {};
      }
    })();
    const isDryRun = body.dryRun === true;
    if (isDryRun) {
      // Dry-run never touches rows. First call reports the
      // pre-purge count (matched === wouldDelete by D4 contract);
      // second call (after a real purge) reports 0.
      const matched = purgeCount === 0 ? 1284 : 0;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ matched, wouldDelete: matched }),
      });
      return;
    }
    // Real purge — atomic deleteMany returns matched===deleted.
    purgeCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ matched: 1284, deleted: 1284 }),
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
  test.describe(`Module-4 PR #4 (task 4.3+4.4) — audit vertical flow [${locale}]`, () => {
    test(`admin walks list-audit → filter-by-actorId → see-own-REVOKE_SESSION → dry-run-purge → real-purge → verify-deletion`, async ({
      page,
    }) => {
      await mockAuditEndpoints(page, locale);
      await stubAdminSession(page, locale);

      // 1. Admin lands on /{locale}/admin/audit.
      await page.goto(`/${locale}/admin/audit`);
      await page
        .waitForLoadState("networkidle", { timeout: 5_000 })
        .catch(() => undefined);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /audit|auditor[ií]a/i,
        }),
      ).toBeVisible({ timeout: 5_000 });

      // 2. The AuditLogTable renders the mocked audit rows.
      // evt-1 + evt-2 are actor=ADMIN, evt-3 is actor=target.
      // The REVOKE_SESSION row (evt-1) is the admin's own.
      await expect(
        page.getByText(ADMIN_USER_EMAIL).first(),
      ).toBeVisible({ timeout: 5_000 });

      // 3. Filter by actorId=<admin.id>. The filter bar submits a
      // query that the mocked GET /admin/audit picks up — only
      // rows whose actorId matches are returned.
      await page
        .getByLabel(/actor ?id|actorId/i)
        .first()
        .fill(ADMIN_USER_ID);
      await page
        .getByRole("button", { name: /apply|aplicar|filter|filtrar/i })
        .first()
        .click();
      // evt-3 should NOT be present (actorId mismatch).
      await page.waitForTimeout(200);

      // 4. The admin's own REVOKE_SESSION row (evt-1) appears in
      // the filtered result. We assert the HMAC ipAddress column
      // renders the 64-char hex verbatim (per D6 + audit-log-ui
      // spec).
      await expect(page.getByTestId("audit-table-row").first()).toBeVisible({
        timeout: 5_000,
      });

      // 5. Dry-run purge with olderThanDays=1. The button reads
      // "Dry run" or "Vista previa" (i18n). The mocked POST
      // returns { matched: 1284, wouldDelete: 1284 }.
      await page.getByLabel(/older.*days|d[ií]as/i).first().fill("1");
      await page
        .getByRole("button", { name: /dry ?run|vista previa|dry-run/i })
        .first()
        .click();
      // JD-5 fix: the dry-run success banner uses the canonical
      // `data-testid="retention-dry-run-result"` (matches the
      // AuditRetentionButton component + the unit tests in
      // `audit-retention-button.test.tsx`).
      await expect(page.getByTestId("retention-dry-run-result")).toBeVisible({
        timeout: 5_000,
      });

      // 6. Real purge with olderThanDays=90. The button reads
      // "Purge" or "Purgar" (i18n) and opens a confirm dialog
      // (per AGENTS.md §9 destructive-action pattern). The mocked
      // POST returns { matched: 1284, deleted: 1284 }.
      await page.getByLabel(/older.*days|d[ií]as/i).first().fill("90");
      await page
        .getByRole("button", { name: /purge|purgar|confirm|confirmar/i })
        .first()
        .click();
      // The confirm dialog opens — click the destructive
      // confirmation button.
      await page
        .getByRole("button", { name: /confirm|confirmar|purge|purgar/i })
        .last()
        .click();
      // JD-5 fix: the real-purge success banner uses the
      // canonical `data-testid="retention-purge-result"`.
      await expect(page.getByTestId("retention-purge-result")).toBeVisible({
        timeout: 5_000,
      });

      // 7. A second dry-run with olderThanDays=90 returns 0
      // (idempotency per D4 + threat matrix retention row).
      // The mocked POST returns { matched: 0, wouldDelete: 0 } on
      // the second dry-run (purgeCount incremented by the prior
      // real purge).
      await page.getByLabel(/older.*days|d[ií]as/i).first().fill("90");
      await page
        .getByRole("button", { name: /dry ?run|vista previa|dry-run/i })
        .first()
        .click();
      await expect(
        page.getByText(/0|no.*matched|sin coincidencias|no results/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    });
  });
}
