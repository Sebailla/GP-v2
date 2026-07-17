import { describe, expect, it, vi } from "vitest";

/**
 * TDD contract for the security-headers wrapper added by T1.10.
 *
 * R-PF-3 requires every web response to carry:
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - X-Frame-Options: DENY
 *   - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
 *     (only when NODE_ENV !== "development")
 *
 * The existing `apps/web/__tests__/middleware.test.ts` (slice 4 T4.3)
 * exercises the next-intl locale routing with a real `createMiddleware`
 * and constructs real `NextRequest` objects. That test is large, shares
 * the file with other locale-routing assertions, and depends on the
 * real next-intl middleware path.
 *
 * This file is the security-headers seam: it mocks `next-intl/middleware`
 * so the test focuses on what the wrapper adds (the security headers),
 * not on what next-intl does internally. The mock returns `undefined`,
 * forcing the wrapper to construct a fresh `NextResponse` (the
 * `intlRes?.body` / `intlRes?.status` branches must both work).
 *
 * The matcher (the regex string exported alongside the default
 * middleware function) is asserted on by the existing test file; we
 * do not duplicate that assertion here.
 */

// Mock next-intl/middleware so the test isolates the security-headers
// wrapper. The real createMiddleware would redirect locale-prefix
// requests (the existing middleware.test.ts covers that). Here we
// return `undefined` to exercise the "no intl response" branch — the
// wrapper must still emit the security headers.
vi.mock("next-intl/middleware", () => ({
  default: () => vi.fn().mockReturnValue(undefined),
}));
vi.mock("../i18n", () => ({
  routing: { locales: ["en", "es"], defaultLocale: "en" },
}));

// Importing after the vi.mock declarations above. Vitest hoists
// vi.mock above all imports automatically (factory form, see
// apps/web/__tests__/setup.ts:50-54), but the explicit ordering here
// matches the file the plan references for clarity.
import middleware from "../middleware";

describe("web middleware security headers (R-PF-3, T1.10)", () => {
  it("adds X-Content-Type-Options, Referrer-Policy and X-Frame-Options headers", () => {
    // Mock NextRequest shape — the wrapper reads only what next-intl's
    // middleware would consume (nextUrl for locale detection). For this
    // test the intl mock returns undefined, so the wrapper builds a
    // fresh response with status 200.
    const req = {
      headers: new Headers({ host: "web.example" }),
      nextUrl: { pathname: "/en/status" },
    };

    const response = middleware(req as never, {} as never) as Response;

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});