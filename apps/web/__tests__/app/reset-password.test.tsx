import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// Mock `next-intl/server#getTranslations` — the page uses the
// server-side translator (RSC). Returning a `t` that produces
// `${namespace}.${key}` lets the tests assert on i18n key wiring
// without spinning up a real NextIntlClientProvider.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
}));

// Mock `next-intl` (client side) — the ResetPasswordForm calls
// `useTranslations` from the client entry point. The mock mirrors the
// server-side translation shape.
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `@core/config` — the page reads `env.API_URL` to wire the
// ResetPasswordForm's API base. Returning a deterministic URL keeps
// the fetch assertion stable.
vi.mock("@core/config/web", () => ({
  env: {
    API_URL: "http://api.test",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test@localhost/db",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "x".repeat(32),
    WEB_ORIGIN: "http://localhost:3000",
    PORT: 3001,
  },
}));

// Mock `next/navigation` so the reset-password redirect becomes a
// no-op spy we can assert on.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock `next/headers` cookies() so the page's
// getSession() redirect-if-already-authenticated check is
// testable.
let cookieStore: Record<string, string> = {};
const mockCookiesImpl = (): Promise<{
  get: (name: string) => { name: string; value: string } | undefined;
}> => {
  return Promise.resolve({
    get: (name: string) =>
      name in cookieStore ? { name, value: cookieStore[name] as string } : undefined,
  });
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => mockCookiesImpl()),
}));

// Stub `fetch` per test via `vi.fn()`.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Page under test — imported AFTER the mocks above so the mocks win.
import ResetPasswordPage from "../../app/[locale]/(auth)/reset-password/[token]/page";

/**
 * TDD contract for
 * `apps/web/app/[locale]/(auth)/reset-password/[token]/page.tsx` —
 * slice 4 batch 4d (T4.11).
 *
 * The page is a Server Component that:
 *  1. Awaits `params` (Next.js 15 async params) and extracts the
 *     `token` from the URL dynamic segment.
 *  2. Renders the ResetPasswordForm inside a Card with the page title
 *     sourced via `getTranslations("auth.resetPassword")` from
 *     `next-intl/server`.
 *  3. Wires the API base URL from `env.API_URL`.
 *  4. On 200 (success): the form calls `router.replace('/{locale}/sign-in')`
 *     (the page preserves the active locale through the redirect).
 *
 * The page is an async RSC; tests await the page function and pass the
 * result to `render()`.
 */
describe("ResetPasswordPage — slice 4 batch 4d (T4.11)", () => {
  const TOKEN = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  beforeEach(() => {
    mockFetch.mockReset();
    mockReplace.mockReset();
    cookieStore = {};
  });

  afterEach(() => {
    cleanup();
  });

  async function renderPage(locale = "en", token = TOKEN): Promise<void> {
    const element = await ResetPasswordPage({
      params: Promise.resolve({ locale, token }),
    });
    render(element);
  }

  it("renders the page with the ResetPasswordForm + the i18n-keyed title", async () => {
    await renderPage();

    expect(screen.getByText("auth.resetPassword.title")).toBeInTheDocument();
    expect(screen.getByLabelText(/auth\.resetPassword\.newPassword/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /auth\.resetPassword\.submit/i }),
    ).toBeInTheDocument();
  });

  it("POSTs to ${API_URL}/auth/reset-password with the token + new-password and triggers router.replace('/{locale}/sign-in') on 200", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await renderPage("en");

    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/i), {
      target: { value: "new-valid-password-123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /auth\.resetPassword\.submit/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/auth/reset-password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      token: TOKEN,
      newPassword: "new-valid-password-123",
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/en/sign-in");
    });
  });

  it("renders the back-to-sign-in redirect with the active locale (es)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await renderPage("es");

    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/i), {
      target: { value: "new-valid-password-123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /auth\.resetPassword\.submit/i }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/es/sign-in");
    });
  });

  it("shows the invalidToken error when the API returns 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await renderPage("en");

    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/i), {
      target: { value: "new-valid-password-123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /auth\.resetPassword\.submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/auth\.resetPassword\.error\.invalidToken/i)).toBeInTheDocument();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to /{locale}/ when the authjs.session-token cookie is set (slice 4 cookie migration final)", async () => {
    // Slice 4 batch 2: the ResetPasswordPage MUST call
    // getSession() and redirect(/${locale}/) if a session is
    // present. The user can request a new reset even if
    // authenticated; this check is a UX nicety (avoid
    // showing the reset form to an authed user who probably
    // just landed there from a stale email link).
    cookieStore = {
      "authjs.session-token": JSON.stringify({
        token: "session-token-abc",
        user: { id: "user-1", email: "alice@example.com", role: "USER" },
      }),
    };
    await expect(renderPage("en", TOKEN)).rejects.toThrow();
  });
});
