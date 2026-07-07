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

import { SignUpForm } from "../../../components/auth/SignUpForm";

/**
 * TDD contract for `apps/web/components/auth/SignUpForm.tsx` — slice 4
 * follow-ups (per-form test slim).
 *
 * **Form-specific scope.** This file now asserts ONLY the form-specific
 * wiring that the consolidated `state-coverage.test.tsx` (T4.14) does not
 * cover: the `apiUrl` propagation (POSTs to `${apiUrl}/auth/register`)
 * and the `onSuccess` callback (the parent's redirect to `/${locale}/sign-in`).
 * The state-coverage harness tests the empty / validation / loading /
 * api-error / success RENDER states via a mock `onSuccess`, but it does
 * not pin the **request shape** for this 3-field form (the request body
 * carries `name` in addition to `email` + `password`). The 5-state
 * rendering tests for SignUpForm were consolidated into
 * `state-coverage.test.tsx` in slice 4 follow-up cleanup (per the
 * `Decision needed before apply` marker; see apply-progress slice 4
 * follow-ups).
 *
 * **Note on `locale`.** `locale` is NOT a prop on `SignUpForm` — it lives
 * on the parent `SignUpClient` wrapper, which translates the form's
 * `onSuccess` callback into a `router.replace('/${locale}/sign-in')`. The
 * locale-aware redirect is tested at the page level (`sign-up.test.tsx`).
 *
 * (consolidated into state-coverage.test.tsx; see T4.14)
 *  - empty / validation / loading / 409 / 500 / network-failure rendering
 *    → covered by `state-coverage.test.tsx` SignUpForm describe block.
 *
 * **Form-specific test kept here.**
 *  - The form POSTs to `${apiUrl}/auth/register` with the 3-field payload
 *    `{ email, password, name }` and calls `onSuccess()` exactly once on
 *    a 201 response.
 */
describe("SignUpForm — slice 4 follow-ups (per-form test slim)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function renderForm(
    overrides: {
      onSuccess?: ReturnType<typeof vi.fn>;
      apiUrl?: string;
    } = {},
  ): { onSuccess: ReturnType<typeof vi.fn> } {
    const onSuccess: ReturnType<typeof vi.fn> =
      overrides.onSuccess ?? vi.fn();
    render(
      <SignUpForm
        apiUrl={overrides.apiUrl ?? "http://api.test"}
        onSuccess={onSuccess as unknown as () => unknown}
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

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.signUp\.submit/i }),
    );

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
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});