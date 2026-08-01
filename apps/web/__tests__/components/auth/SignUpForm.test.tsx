import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// RTL v16 no longer auto-registers cleanup — wire it ourselves so DOM
// nodes from one `it` don't leak into the next.
afterEach(() => {
  cleanup();
});

// Mock `next-intl` BEFORE importing the form. The mock returns a `t`
// function that produces a deterministic key-shaped string so the tests
// assert on i18n key wiring without depending on a real IntlProvider
// (which next-intl requires at the top of the tree).
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Stub `fetch` per test via `vi.fn()`.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Capture document.cookie SETTER so we can assert on the attribute
// string. Mirrors the spy in LoginForm.test.tsx.
let lastSetCookie: string | null = null;
const originalCookieSetter = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.set;

beforeEach(() => {
  mockFetch.mockReset();
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
  if (originalCookieSetter) {
    const originalGet = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.get;
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => originalGet?.call(document) ?? "",
      set: originalCookieSetter,
    });
  }
  document.cookie = "authjs.session-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

import { SignUpForm } from "../../../components/auth/SignUpForm";
import { AUTH_SESSION_COOKIE } from "../../../lib/auth-server";

/**
 * TDD contract for `apps/web/components/auth/SignUpForm.tsx` — slice 4
 * batch 2 (cookie-on-success).
 *
 * **Form-specific scope.** This file now asserts the slice 4 batch 2
 * cookie-on-success wiring: on a 201 response, the form MUST write
 * the authjs.session-token cookie via `setSessionCookie(session)` AND call
 * the parent's `onSuccess(session)` so the parent (SignUpClient) can
 * navigate to `/${locale}/sign-in`. The 5-state rendering tests for
 * SignUpForm remain consolidated in `state-coverage.test.tsx` (T4.14).
 *
 * **Note on `locale`.** `locale` is NOT a prop on `SignUpForm` — it
 * lives on the parent `SignUpClient` wrapper, which translates the
 * form's `onSuccess` callback into a `window.location.href =
 * '/${locale}/sign-in'`. The locale-aware redirect is tested at the
 * page level (`sign-up.test.tsx`).
 */
describe("SignUpForm — slice 4 batch 2 (cookie-on-success)", () => {
  function renderForm(overrides: { onSuccess?: ReturnType<typeof vi.fn>; apiUrl?: string } = {}): {
    onSuccess: ReturnType<typeof vi.fn>;
  } {
    const onSuccess: ReturnType<typeof vi.fn> = overrides.onSuccess ?? vi.fn();
    render(
      <SignUpForm
        apiUrl={overrides.apiUrl ?? "http://api.test"}
        onSuccess={
          onSuccess as unknown as (session: {
            token: string;
            user: { id: string; email: string; role: string };
          }) => unknown
        }
      />,
    );
    return { onSuccess };
  }

  it("calls the API with the form payload and triggers onSuccess on a 201 response", async () => {
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

    const { onSuccess } = renderForm();

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
    let requestBody: unknown;
    try {
      requestBody = JSON.parse(String(init.body)) as unknown;
    } catch (error) {
      throw new Error(`request body did not parse as JSON: ${(error as Error).message}`);
    }
    expect(requestBody).toEqual({
      email: "alice@example.com",
      password: "valid-password-123",
      name: "Alice",
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const callArg = onSuccess.mock.calls[0]?.[0] as
      { token: string; user: { id: string; email: string; role: string } } | undefined;
    expect(callArg).toEqual({
      token: "session-token-abc",
      user: { id: "user-1", email: "alice@example.com", role: "USER" },
    });
  });

  it.skip("writes the authjs.session-token cookie to document.cookie on a 201 response", async () => {
    // v1.4.0 refactor: REMOVED. The SignUpForm no longer writes
    // the session cookie via `document.cookie` (the slice-2
    // `setSessionCookie` call was a no-op for the HttpOnly flag).
    // The cookie is now set by the API's `Set-Cookie` response
    // header (`apps/api/src/modules/auth/auth.controller.ts
    // #register`). Preserved (skipped) as a regression net.
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

    const { onSuccess } = renderForm();

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
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    // The form's success path wrote the cookie via document.cookie
    // BEFORE invoking the parent's onSuccess.
    expect(lastSetCookie).not.toBeNull();
    const cookieStr = String(lastSetCookie);
    expect(cookieStr.startsWith(`${AUTH_SESSION_COOKIE}=`)).toBe(true);
    expect(cookieStr).toMatch(/path=\//i);
    expect(cookieStr).toMatch(/max-age=86400/i);
    expect(cookieStr).toMatch(/samesite=lax/i);
    expect(cookieStr).toMatch(/httponly/i);
  });
});
