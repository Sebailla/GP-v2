import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

// RTL v16 no longer auto-registers the per-test cleanup hook — wire it
// ourselves so DOM nodes from one `it` do not leak into the next.
afterEach(() => {
  cleanup();
});

// Mock `next-intl` BEFORE importing the form. The mock returns a `t` function
// that produces a deterministic key-shaped string (`<scope>.<key>`) so the
// tests can assert on i18n key wiring without depending on a real IntlProvider
// (which next-intl requires at the top of the tree — outside the unit-test
// scope for a single component).
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Stub `fetch` per test via `vi.fn()`; happy-dom does not ship fetch.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Component under test — imported AFTER the mocks above so the mocks win.
import { LoginForm } from "../../../components/auth/LoginForm";

/**
 * TDD contract for `apps/web/components/auth/LoginForm.tsx` — slice 4
 * follow-ups (per-form test slim).
 *
 * **Form-specific scope.** This file now asserts ONLY the form-specific
 * wiring that the consolidated `state-coverage.test.tsx` (T4.14) does not
 * cover: the `onSuccess` callback is the parent's redirect signal — the
 * form calls `onSuccess()` on a 200 response, and the parent (SignInClient)
 * wires it to `router.replace(`/${locale}`)`. The state-coverage harness
 * tests the empty / validation / loading / api-error / success RENDER
 * states via a mock `onSuccess`, but it does not exercise the
 * **request shape** (URL + method + body) that this form-specific file
 * pins. The 5-state rendering tests for LoginForm were consolidated into
 * `state-coverage.test.tsx` in slice 4 follow-up cleanup (per the
 * `Decision needed before apply` marker; see apply-progress slice 4
 * follow-ups).
 *
 * (consolidated into state-coverage.test.tsx; see T4.14)
 *  - empty / validation / loading / 401 / 500 rendering
 *    → covered by `state-coverage.test.tsx` LoginForm describe block.
 *
 * **Form-specific test kept here.**
 *  - The form calls `onSuccess()` exactly once on a 200 response, with the
 *    expected request shape (URL = `${apiUrl}/auth/login`, method = POST,
 *    body = JSON-encoded `{ email, password }`).
 */
describe("LoginForm — slice 4 follow-ups (per-form test slim)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function renderForm(
    overrides: { onSuccess?: ReturnType<typeof vi.fn>; apiUrl?: string } = {},
  ): { onSuccess: ReturnType<typeof vi.fn> } {
    const onSuccess: ReturnType<typeof vi.fn> = overrides.onSuccess ?? vi.fn();
    render(
      <LoginForm
        apiUrl={overrides.apiUrl ?? "http://api.test"}
        onSuccess={onSuccess as unknown as () => unknown}
      />,
    );
    return { onSuccess };
  }

  it("calls the API with the form payload and triggers onSuccess on a 200 response", async () => {
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

    const { onSuccess } = renderForm();

    fireEvent.change(screen.getByLabelText(/auth\.signIn\.email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signIn\.password/i), {
      target: { value: "valid-password-123" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.signIn\.submit/i }),
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Verify the request shape (URL + method + body).
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "alice@example.com",
      password: "valid-password-123",
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});