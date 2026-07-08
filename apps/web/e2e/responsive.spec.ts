import { test, expect } from "@playwright/test";

/**
 * Slice 4 batch 4e — T4.15 responsive viewport test.
 *
 * Per tasks.md T4.15, the responsive layout is verified at the
 * canonical viewports:
 *  - mobile 360px (the smallest typical phone)
 *  - desktop 1440px (a standard laptop)
 *
 * For each viewport, the test asserts the page does NOT horizontally
 * overflow (which would indicate a layout bug at narrow widths).
 * This is the slice 4 implementation of the slice 3 batch 5's
 * `ui-complete-not-scaffold` convention (id 2133) that requires
 * "no overflow at intermediate widths".
 *
 * The dev-mailbox is NOT exercised here (the dev mailbox is a
 * developer affordance; its layout is intentionally desktop-only).
 */

test.describe("T4.15 responsive — auth screens", () => {
  test("sign-in page does not overflow at 360px or 1440px", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/en/sign-in");
      // If the page overflows horizontally, document.documentElement
      // will report a scrollWidth greater than the viewport width.
      const overflow = await page.evaluate((vw) => {
        return document.documentElement.scrollWidth > vw;
      }, viewport.width);
      expect(overflow).toBe(false);
    }
  });

  test("sign-up page does not overflow at 360px or 1440px", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/en/sign-up");
      const overflow = await page.evaluate((vw) => {
        return document.documentElement.scrollWidth > vw;
      }, viewport.width);
      expect(overflow).toBe(false);
    }
  });

  test("forgot-password page does not overflow at 360px or 1440px", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/en/forgot-password");
      const overflow = await page.evaluate((vw) => {
        return document.documentElement.scrollWidth > vw;
      }, viewport.width);
      expect(overflow).toBe(false);
    }
  });

  test("reset-password/[token] page does not overflow at 360px or 1440px", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(
        "/en/reset-password/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
      const overflow = await page.evaluate((vw) => {
        return document.documentElement.scrollWidth > vw;
      }, viewport.width);
      expect(overflow).toBe(false);
    }
  });
});
