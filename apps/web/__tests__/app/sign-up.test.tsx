import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// Mock `next-intl/server#getTranslations` — the page uses the
// server-side translator (RSC). Returning a `t` that produces
// `${namespace}.${key}` lets the tests assert on i18n key wiring
// without spinning up a real NextIntlClientProvider.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
}));

// Mock `next-intl` (client side) — the SignUpForm calls
// `useTranslations` from the client entry point. The mock mirrors the
// server-side translation shape so the rendered tree shows the
// i18n-keyed strings instead of `MISSING_MESSAGE`.
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `@core/config` — the page reads `env.API_URL` to wire the
// SignUpForm's API base. Returning a deterministic URL keeps the
// fetch assertion stable.
vi.mock("@core/config", () => ({
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

// Mock `next/navigation` so the SignUpClient wrapper's redirect
// becomes a no-op spy we can assert on.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock `next/headers` cookies() so the page's
// getSession() redirect-if-already-authenticated check is
// testable. The mock returns a per-test store we can poke
// directly to simulate an authenticated session.
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
import SignUpPage from "../../app/[locale]/(auth)/sign-up/page";

/**
 * TDD contract for `apps/web/app/[locale]/(auth)/sign-up/page.tsx` —
 * slice 4 batch 4c (T4.9).
 *
 * Same pattern as the sign-in page (T4.8) but for registration.
 * The page renders the SignUpForm inside a Card with the
 * `auth.signUp.title` i18n key.
 *
 * The page is an async RSC; tests await the page function and
 * pass the result to `render()`.
 *
 * Deferred (NOT implemented in this batch — T3.3 deferred item):
 *  - Redirect-if-already-authenticated. Without `apps/web/auth.ts`
 *    wired up to NextAuth, there is no `auth()` to call. The page
 *    renders SignUpForm unconditionally.
 */
describe("SignUpPage — slice 4 batch 4c (T4.9)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockReplace.mockReset();
    cookieStore = {};
  });

  afterEach(() => {
    cleanup();
  });

  async function renderPage(locale = "en") {
    const element = await SignUpPage({
      params: Promise.resolve({ locale }),
    });
    render(element);
  }

  it("renders the page with the SignUpForm + the i18n-keyed title", async () => {
    await renderPage("en");

    expect(screen.getByText("auth.signUp.title")).toBeInTheDocument();

    // The SignUpForm fields + submit button are present.
    expect(screen.getByLabelText(/auth\.signUp\.email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auth\.signUp\.password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auth\.signUp\.name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auth\.signUp\.submit/i })).toBeInTheDocument();
  });

  it("renders the page in Spanish locale with the same i18n-keyed copy", async () => {
    await renderPage("es");

    expect(screen.getByText("auth.signUp.title")).toBeInTheDocument();
    expect(screen.getByLabelText(/auth\.signUp\.email/i)).toBeInTheDocument();
  });

  it("redirects to /{locale}/ when the authjs.session-token cookie is set (slice 4 cookie migration final)", async () => {
    // Slice 4 batch 2: the SignUpPage MUST call getSession()
    // and redirect(/${locale}/) if a session is present.
    cookieStore = {
      "authjs.session-token": JSON.stringify({
        token: "session-token-abc",
        user: { id: "user-1", email: "alice@example.com", role: "USER" },
      }),
    };
    await expect(renderPage("en")).rejects.toThrow();
  });

  it("POSTs to ${API_URL}/auth/register with the form payload and triggers router.replace('/{locale}/sign-in') on 201", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        sessionToken: "session-token-abc",
      }),
    });

    await renderPage("en");

    fireEvent.change(screen.getByLabelText(/auth\.signUp\.email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.password/i), {
      target: { value: "valid-password-123" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.name/i), {
      target: { value: "Alice" },
    });

    fireEvent.click(screen.getByRole("button", { name: /auth\.signUp\.submit/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/auth/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "alice@example.com",
      password: "valid-password-123",
      name: "Alice",
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/en/sign-in");
    });
  });

  it("shows the form-level duplicateEmail error when the API returns 409", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "EMAIL_ALREADY_EXISTS", message: "nope" }),
    });

    await renderPage("en");

    fireEvent.change(screen.getByLabelText(/auth\.signUp\.email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.password/i), {
      target: { value: "valid-password-123" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.name/i), {
      target: { value: "Alice" },
    });

    fireEvent.click(screen.getByRole("button", { name: /auth\.signUp\.submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/auth\.signUp\.error\.duplicateEmail/i)).toBeInTheDocument();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows the generic error when the API returns 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await renderPage("en");

    fireEvent.change(screen.getByLabelText(/auth\.signUp\.email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.password/i), {
      target: { value: "valid-password-123" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.name/i), {
      target: { value: "Alice" },
    });

    fireEvent.click(screen.getByRole("button", { name: /auth\.signUp\.submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/auth\.common\.genericError/i)).toBeInTheDocument();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
