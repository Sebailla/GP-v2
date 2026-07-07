import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
} from "@testing-library/react";

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

// Component under test — imported AFTER the mocks above so the mocks win.
import { ForgotPasswordForm } from "../../../components/auth/ForgotPasswordForm";

/**
 * TDD contract for `apps/web/components/auth/ForgotPasswordForm.tsx` —
 * slice 4 batch 4d (T4.10).
 *
 * The form is an idempotent client component that:
 *  1. Renders an email field bound to `forgotPasswordSchema.shape.email`
 *     via `react-hook-form` + the local `@/lib/zod-resolver` adapter.
 *  2. Renders a submit button with the `auth.forgotPassword.submit` label.
 *  3. On submit: validates via `forgotPasswordSchema`, then POSTs to
 *     `${apiUrl}/auth/forgot-password` with `{ email }`.
 *  4. Both 202 (email registered) AND 202 (email unknown — API is
 *     idempotent to prevent account enumeration) collapse to the
 *     SUCCESS state, which renders the `auth.forgotPassword.success`
 *     copy + a link back to `/sign-in`. The form NEVER branches on
 *     "did this email exist?" — that's the enumeration-leak prevention.
 *  5. On 500 (or any non-2xx) or network failure: renders
 *     `auth.common.genericError` above the field.
 *  6. While in-flight: submit button disabled + label swapped to
 *     `auth.common.loading`; `<form aria-busy="true">`.
 *
 * Tests verify the 3 form states per the brief: empty / loading / success
 * (api-error is the failure path of the success branch — the brief groups
 * them as "3 form states" because there is no validation-error vs api-error
 * distinction at the form-level; only field-level validation + form-level
 * api-error / success).
 */
describe("ForgotPasswordForm — slice 4 batch 4d (T4.10)", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	function renderForm(): void {
		render(<ForgotPasswordForm apiUrl="http://api.test" locale="en" />);
	}

	it("renders the email field + submit button with the expected i18n keys", () => {
		renderForm();

		const email = screen.getByLabelText(/auth\.forgotPassword\.email/i);
		const submit = screen.getByRole("button", {
			name: /auth\.forgotPassword\.submit/i,
		});

		expect(email).toBeInTheDocument();
		expect(email).toHaveAttribute("type", "email");
		expect(submit).toBeInTheDocument();
		expect(submit).toHaveAttribute("type", "submit");
	});

	it("shows a field-level validation error when the user submits an empty email", async () => {
		renderForm();

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.forgotPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(
				screen.queryByTestId("forgot-password-email-error"),
			).not.toBeNull();
		});

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("calls the API with the email payload and shows the success state on a 202 response", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 202,
			json: async () => ({}),
		});

		renderForm();

		fireEvent.change(screen.getByLabelText(/auth\.forgotPassword\.email/i), {
			target: { value: "alice@example.com" },
		});

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.forgotPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		// Verify the request shape — POST {apiUrl}/auth/forgot-password with JSON body.
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://api.test/auth/forgot-password");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			email: "alice@example.com",
		});

		// Success state: the form is replaced by the success message + back-to-signin link.
		await waitFor(() => {
			expect(
				screen.getByText(/auth\.forgotPassword\.success/i),
			).toBeInTheDocument();
		});
		expect(
			screen.getByRole("link", { name: /auth\.common\.backToLoginLink/i }),
		).toHaveAttribute("href", "/en/sign-in");
	});

	it("shows the generic error when the API returns 500", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => ({}),
		});

		renderForm();

		fireEvent.change(screen.getByLabelText(/auth\.forgotPassword\.email/i), {
			target: { value: "alice@example.com" },
		});

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.forgotPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(
				screen.getByText(/auth\.common\.genericError/i),
			).toBeInTheDocument();
		});

		// The success copy MUST NOT appear on a 5xx.
		expect(
			screen.queryByText(/auth\.forgotPassword\.success/i),
		).not.toBeInTheDocument();
	});

	it("disables the submit button and sets aria-busy='true' while the request is in-flight", async () => {
		// Make the fetch hang until we resolve it manually so we can observe
		// the loading state.
		let resolveFetch!: (value: unknown) => void;
		mockFetch.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveFetch = resolve;
			}),
		);

		renderForm();

		fireEvent.change(screen.getByLabelText(/auth\.forgotPassword\.email/i), {
			target: { value: "alice@example.com" },
		});

		const submit = screen.getByRole("button", {
			name: /auth\.forgotPassword\.submit/i,
		});
		fireEvent.click(submit);

		// While in flight: button label switches to `auth.common.loading`,
		// button is disabled, and the form has `aria-busy="true"`.
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /auth\.common\.loading/i }),
			).toBeDisabled();
		});

		const form = submit.closest("form");
		expect(form).not.toBeNull();
		expect(form).toHaveAttribute("aria-busy", "true");

		// Resolve the in-flight request so the test cleans up.
		resolveFetch({ ok: true, status: 202, json: async () => ({}) });
	});
});
