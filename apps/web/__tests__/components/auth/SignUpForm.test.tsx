import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
// (RTL v16 cleanup is registered in the global setup.ts.)

// RTL v16 no longer auto-registers cleanup — wire it ourselves so
// DOM nodes from one `it` don't leak into the next.
afterEach(() => {
  cleanup();
});

// Mock `next-intl` BEFORE importing the form. The mock returns a `t`
// function that produces a deterministic key-shaped string so the
// tests assert on i18n key wiring without depending on a real
// IntlProvider (which next-intl requires at the top of the tree).
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Stub `fetch` per test via `vi.fn()`.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { SignUpForm } from "../../../components/auth/SignUpForm";

/**
 * TDD contract for `apps/web/components/auth/SignUpForm.tsx` —
 * slice 4 batch 4c (T4.9).
 *
 * Same shape as the LoginForm (T4.1) but bound to `registerSchema`
 * (email + password + name) and POSTed to `${apiUrl}/auth/register`.
 *
 * Five form states per convention `ui-complete-not-scaffold` (id 2133):
 *  1. Empty (initial render): all 3 fields empty, no error.
 *  2. Validation-error: Zod issues surface under the offending field.
 *  3. Loading: submit button disabled + label swapped to
 *     `auth.common.loading` + the form has `aria-busy="true"`.
 *  4. API-error:
 *     - 409 → form-level `auth.signUp.error.duplicateEmail`
 *     - 400 → form-level `auth.common.genericError`
 *     - other / network → `auth.common.genericError`
 *  5. Success (201): parent-supplied `onSuccess()` fires.
 *
 * The session token returned by POST /auth/register is NOT stored
 * in this batch — cookie storage lands alongside the NextAuth
 * client config (T3.3 deferred).
 */
describe("SignUpForm — slice 4 batch 4c (T4.9)", () => {
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

  it("renders email + password + name fields + submit button with the expected i18n keys", () => {
    renderForm();

    const email = screen.getByLabelText(/auth\.signUp\.email/i);
    const password = screen.getByLabelText(/auth\.signUp\.password/i);
    const name = screen.getByLabelText(/auth\.signUp\.name/i);
    const submit = screen.getByRole("button", {
      name: /auth\.signUp\.submit/i,
    });

    expect(email).toBeInTheDocument();
    expect(email).toHaveAttribute("type", "email");
    expect(password).toBeInTheDocument();
    expect(password).toHaveAttribute("type", "password");
    expect(name).toBeInTheDocument();
    expect(name).toHaveAttribute("type", "text");
    expect(submit).toBeInTheDocument();
    expect(submit).toHaveAttribute("type", "submit");
  });

  it("shows field-level validation errors when the user submits empty fields", async () => {
    renderForm();

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.signUp\.submit/i }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId("signup-email-error")).not.toBeNull();
      expect(screen.queryByTestId("signup-password-error")).not.toBeNull();
      expect(screen.queryByTestId("signup-name-error")).not.toBeNull();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

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

  it("shows the form-level duplicateEmail error when the API returns 409", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "EMAIL_ALREADY_EXISTS", message: "nope" }),
    });

    renderForm();

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
      expect(
        screen.getByText(/auth\.signUp\.error\.duplicateEmail/i),
      ).toBeInTheDocument();
    });
  });

  it("shows the generic error when the API returns 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    renderForm();

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
      expect(screen.getByText(/auth\.common\.genericError/i)).toBeInTheDocument();
    });
  });

  it("disables the submit button and sets aria-busy='true' while the request is in-flight", async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderForm();

    fireEvent.change(screen.getByLabelText(/auth\.signUp\.email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.password/i), {
      target: { value: "valid-password-123" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.signUp\.name/i), {
      target: { value: "Alice" },
    });

    const submit = screen.getByRole("button", {
      name: /auth\.signUp\.submit/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /auth\.common\.loading/i }),
      ).toBeDisabled();
    });

    const form = submit.closest("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("aria-busy", "true");

    // Resolve the in-flight request so the test cleans up.
    resolveFetch({
      ok: true,
      status: 201,
      json: async () => ({ id: "u", email: "e", role: "USER", sessionToken: "t" }),
    });
  });

  it("shows the generic error when fetch itself rejects (network failure)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    renderForm();

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
      expect(screen.getByText(/auth\.common\.genericError/i)).toBeInTheDocument();
    });
  });

  it("clears the form-level error when the user resets the form via re-mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({}),
    });

    renderForm();

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
      expect(
        screen.getByText(/auth\.signUp\.error\.duplicateEmail/i),
      ).toBeInTheDocument();
    });

    // Re-mount = the canonical reset idiom for the unit-test scope.
    cleanup();
    renderForm();

    expect(
      screen.queryByText(/auth\.signUp\.error\.duplicateEmail/i),
    ).not.toBeInTheDocument();
  });
});