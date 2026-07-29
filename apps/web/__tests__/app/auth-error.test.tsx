import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock `next-intl/server#getTranslations` BEFORE importing the page —
// returning a `t` that produces `${namespace}.${key}` lets the tests
// assert on i18n key wiring without spinning up a real
// NextIntlClientProvider.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
}));

// Mock `next/navigation` `searchParams` accessor — Next.js pages receive
// searchParams as a Promise. We expose a single per-file store the
// test mutates directly.
const searchParamsStore: Record<string, string> = {};

vi.mock("next/navigation", () => ({
  // Module-level stub: the page reads `searchParams` via the page
  // props (not via a hook), so the actual hook mock is not on the
  // critical path. Stubbing it avoids "useSearchParams is not
  // implemented" warnings in happy-dom.
  useSearchParams: () => new URLSearchParams(searchParamsStore as Record<string, string>),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useParams: () => ({}),
}));

afterEach(() => {
  cleanup();
  for (const key of Object.keys(searchParamsStore)) {
    delete searchParamsStore[key];
  }
});

// Page under test — imported AFTER the mocks above so the mocks win.
import AuthErrorPage from "../../app/[locale]/(auth)/error/page";

/**
 * TDD contract for `apps/web/app/[locale]/(auth)/error/page.tsx` —
 * module 2 public-auth (PR #1, task 1.4 TRIANGULATE).
 *
 * Per `openspec/specs/nextauth-web-routes/spec.md` §Requirement:
 * Callback URL Validation:
 *
 *   "Invalid callback URLs MUST land the user on `pages.error`
 *    with localized copy; the response MUST NOT silently redirect
 *    to an attacker-controlled origin."
 *
 * PR #1 (this batch) ships the locale-aware error page so the
 * NextAuth error surface is localized. The actual NextAuth flow
 * that rejects foreign callback URLs lands in PR #4 (per
 * `openspec/changes/module-2-public-auth/tasks.md` task 4.7);
 * PR #1 only needs the destination page to exist + localize the
 * canonical NextAuth error codes so the foreign-callback flow
 * has a localized terminal surface from day one.
 */
describe("AuthErrorPage — module 2 public-auth (PR #1 task 1.4)", () => {
  async function renderPage(
    locale: string,
    searchParams: Record<string, string> = {},
  ): Promise<void> {
    for (const [k, v] of Object.entries(searchParams)) {
      searchParamsStore[k] = v;
    }
    const element = await AuthErrorPage({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve(searchParams),
    });
    render(element);
  }

  it("renders the localized title for an en-locale error page", async () => {
    await renderPage("en", { error: "Configuration" });
    expect(screen.getByText("auth.error.title")).toBeInTheDocument();
  });

  it("renders the localized title for an es-locale error page", async () => {
    await renderPage("es", { error: "Configuration" });
    expect(screen.getByText("auth.error.title")).toBeInTheDocument();
  });

  it("renders a localized message for the Configuration error code", async () => {
    await renderPage("en", { error: "Configuration" });
    // The page MUST translate the canonical NextAuth error code
    // into a localized message under auth.error.codes.<code>.
    expect(
      screen.getByText("auth.error.codes.Configuration"),
    ).toBeInTheDocument();
  });

  it("renders a localized message for the AccessDenied error code (foreign callbackUrl produces this)", async () => {
    // Per NextAuth v5 docs: when a callback URL is rejected as
    // foreign, the user lands on `pages.error?error=AccessDenied`.
    // The page MUST localize that code under auth.error.codes.AccessDenied.
    await renderPage("es", { error: "AccessDenied" });
    expect(
      screen.getByText("auth.error.codes.AccessDenied"),
    ).toBeInTheDocument();
  });

  it("renders a localized message for the OAuthCallback error code", async () => {
    await renderPage("en", { error: "OAuthCallback" });
    expect(
      screen.getByText("auth.error.codes.OAuthCallback"),
    ).toBeInTheDocument();
  });

  it("falls back to the generic localized message when the error code is unknown", async () => {
    await renderPage("en", { error: "TotallyMadeUpErrorCode" });
    expect(
      screen.getByText("auth.error.codes.unknown"),
    ).toBeInTheDocument();
  });

  it("falls back to the generic localized message when no error param is supplied", async () => {
    await renderPage("en", {});
    expect(
      screen.getByText("auth.error.codes.unknown"),
    ).toBeInTheDocument();
  });

  it("exposes a localized 'back to sign-in' link that threads the active locale", async () => {
    await renderPage("es", { error: "Configuration" });
    const backLink = screen.getByRole("link", {
      name: /auth\.error\.backToSignIn/i,
    });
    expect(backLink).toBeInTheDocument();
    expect(backLink.getAttribute("href")).toBe("/es/sign-in");
  });
});