import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

// RTL v16 no longer auto-registers the per-test cleanup hook — wire it
// ourselves so DOM nodes from one `it` do not leak into the next.
afterEach(() => {
  cleanup();
});

// Module-scoped capture so the SignInClient and the test see the SAME
// `vi.fn()` instance for `replace`. The setup.ts at `__tests__/setup.ts`
// also mocks `next/navigation`, but its `useRouter()` returns a fresh
// object on every call — so the test and the component would otherwise
// hold different `replace` spies. Re-mocking here (with vi.mock factory
// hoisting) shadows the global mock for THIS file only.
const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock `next-intl` BEFORE importing the form. The mock returns a `t`
// function that produces a deterministic key-shaped string
// (`<scope>.<key>`) so the tests can assert on i18n key wiring without
// depending on a real IntlProvider.
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `next-auth/react` so we can assert on the `signIn("google",
// { callbackUrl: ... })` call site without wiring a real NextAuth
// provider. The mock keeps a record of every `signIn` invocation so
// the locale-routing assertion can read the callback URL.
const signInCalls: Array<{ provider: string; options: Record<string, unknown> | undefined }> = [];
vi.mock("next-auth/react", () => ({
  signIn: vi.fn((provider: string, options?: Record<string, unknown>) => {
    signInCalls.push({ provider, options });
    return Promise.resolve({ error: "Redirect" } as { error: string });
  }),
}));

// Stub `fetch` per test via `vi.fn()`; happy-dom does not ship fetch.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Capture document.cookie SETTER so we can assert on the attribute
// string (happy-dom's getter only exposes `name=value`). We replace
// the property's setter with a spy; the spy forwards to the original
// setter so the cookie remains visible via the getter.
let lastSetCookie: string | null = null;
const originalCookieSetter = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.set;

beforeEach(() => {
  mockFetch.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
  signInCalls.length = 0;
  lastSetCookie = null;
  const originalGet = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.get;
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => originalGet?.call(document) ?? "",
    set: (value: string) => {
      lastSetCookie = value;
      originalCookieSetter?.call(document, value);
    },
  });
});

afterEach(() => {
  // Restore the original cookie descriptor.
  if (originalCookieSetter) {
    const originalGet = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.get;
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => originalGet?.call(document) ?? "",
      set: originalCookieSetter,
    });
  }
  // Clear any cookie that the test set.
  document.cookie = "authjs.session-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  // Clear Google env so a previous test's mutation doesn't leak.
  delete process.env["GOOGLE_CLIENT_ID"];
  delete process.env["GOOGLE_CLIENT_SECRET"];
});

// Component under test — imported AFTER the mocks above so the mocks win.
import { SignInClient } from "../../../components/auth/SignInClient";
import { AUTH_SESSION_COOKIE } from "../../../lib/auth-server";

/**
 * TDD contract for `apps/web/components/auth/SignInClient.tsx` —
 * module 2 public-auth (PR #1, task 1.1).
 *
 * Per `openspec/changes/module-2-public-auth/design.md` §3 and
 * `openspec/specs/nextauth-web-routes/spec.md`:
 *  - On a 200 from the credentials API, the client navigates to
 *    `/{locale}/(app)` (the post-sign-in landing for the active
 *    locale). The slice-4 batch 2 implementation routed to
 *    `/${locale}` (the bare landing); module 2 redirects to the
 *    `(app)` route group per the product decision in
 *    `openspec/changes/module-2-public-auth/proposal.md` §Product
 *    decisions ("Redirect post sign-in: /[locale]/(app) (dashboard)").
 *  - When Google is configured (env has GOOGLE_CLIENT_ID +
 *    GOOGLE_CLIENT_SECRET), the SignInClient renders a Google sign-in
 *    button that calls `signIn("google", { callbackUrl:
 *    "/{locale}/(app)" })` from `next-auth/react`. When either
 *    credential is missing, the button MUST be absent (per
 *    proposal §Risks "Google client-id (Med) → isGoogleConfigured() +
 *    mock").
 *
 * The `isGoogleConfigured()` predicate reads env vars at call time
 * (not module-load time), so the same test file exercises both the
 * "missing creds" and "creds present" branches by mutating
 * `process.env` between tests.
 */
describe("SignInClient — module 2 public-auth (PR #1 task 1.1)", () => {
  function renderClient(locale: string): void {
    render(<SignInClient apiUrl="http://api.test" locale={locale} />);
  }

  function mockApiSuccess(): void {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        sessionToken: "session-token-abc",
      }),
    });
  }

  async function submitCredentials(): Promise<void> {
    fireEvent.change(screen.getByLabelText(/auth\.signIn\.email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signIn\.password/i), {
      target: { value: "valid-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /auth\.signIn\.submit/i }));
  }

  // The Google button is conditionally rendered based on
  // isGoogleConfigured(). The predicate reads env vars at call time;
  // mutating process.env between tests is the canonical way to exercise
  // both branches from a single test file.
  function clearGoogleEnv(): void {
    delete process.env["GOOGLE_CLIENT_ID"];
    delete process.env["GOOGLE_CLIENT_SECRET"];
  }

  function setGoogleEnv(): void {
    process.env["GOOGLE_CLIENT_ID"] = "test-google-client-id";
    process.env["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret";
  }

  it("routes the credentials success path to '/{locale}/(app)' (en)", async () => {
    clearGoogleEnv();
    mockApiSuccess();

    renderClient("en");

    await submitCredentials();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // The wrapper calls router.replace with the locale-aware
    // target per product decision.
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/en/(app)");
    });
  });

  it("routes the credentials success path to '/{locale}/(app)' (es)", async () => {
    clearGoogleEnv();
    mockApiSuccess();

    renderClient("es");

    await submitCredentials();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/es/(app)");
    });
  });

  it("hides the Google sign-in button when Google credentials are missing", () => {
    clearGoogleEnv();

    renderClient("en");

    // The credentials form is always rendered.
    expect(screen.getByLabelText(/auth\.signIn\.email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auth\.signIn\.password/i)).toBeInTheDocument();

    // The Google button MUST be absent. We assert by name (the
    // button text uses an i18n key under `auth.signIn.google`).
    expect(
      screen.queryByRole("button", { name: /auth\.signIn\.google/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the Google sign-in button when Google credentials are present", () => {
    setGoogleEnv();

    renderClient("en");

    // The credentials form AND the Google button are both rendered.
    expect(screen.getByLabelText(/auth\.signIn\.email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /auth\.signIn\.google/i }),
    ).toBeInTheDocument();
  });

  it("calls signIn('google', { callbackUrl: '/{locale}/(app)' }) when Google is configured", async () => {
    setGoogleEnv();

    renderClient("es");

    fireEvent.click(screen.getByRole("button", { name: /auth\.signIn\.google/i }));

    await waitFor(() => {
      const googleCalls = signInCalls.filter((c) => c.provider === "google");
      expect(googleCalls.length).toBeGreaterThanOrEqual(1);
    });
    const googleCall = signInCalls.find((c) => c.provider === "google");
    expect(googleCall).toBeDefined();
    expect(googleCall?.options).toBeDefined();
    expect(googleCall?.options?.["callbackUrl"]).toBe("/es/(app)");
  });

  it("writes the authjs.session-token cookie to document.cookie on credentials 200", async () => {
    clearGoogleEnv();
    mockApiSuccess();

    renderClient("en");

    await submitCredentials();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(lastSetCookie).not.toBeNull();
    const cookieStr = String(lastSetCookie);
    expect(cookieStr.startsWith(`${AUTH_SESSION_COOKIE}=`)).toBe(true);
  });
});