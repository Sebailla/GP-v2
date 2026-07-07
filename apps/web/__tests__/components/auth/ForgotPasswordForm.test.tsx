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
 * slice 4 follow-ups (per-form test slim).
 *
 * **Form-specific scope.** This file now asserts ONLY the idempotent 202
 * contract that the design documents as a load-bearing invariant and that
 * the consolidated `state-coverage.test.tsx` (T4.14) does not pin: the
 * success state replaces the form with the `auth.forgotPassword.success`
 * copy + a back-to-signin link that points to the right locale-prefixed
 * URL (the `locale` prop is preserved on the link). The state-coverage
 * harness tests the success state via `screen.queryByRole("button", ...)`
 * `not.toBeInTheDocument()`, but it does not assert on the link's `href`
 * (the locale-preservation invariant lives here).
 *
 * The 5-state rendering tests for ForgotPasswordForm were consolidated
 * into `state-coverage.test.tsx` in slice 4 follow-up cleanup (per the
 * `Decision needed before apply` marker; see apply-progress slice 4
 * follow-ups).
 *
 * (consolidated into state-coverage.test.tsx; see T4.14)
 *  - empty / validation / loading / 500 / network-failure rendering
 *    → covered by `state-coverage.test.tsx` ForgotPasswordForm describe block.
 *  - The generic success-state render (form unmounted) is also covered
 *    by state-coverage, but this file pins the URL shape + the
 *    locale-preserved back-to-signin link (the design's idempotency
 *    invariant: 202 collapses BOTH known + unknown emails to the same
 *    success copy, with NO enumeration distinction at the form level).
 *
 * **Form-specific test kept here.**
 *  - The form POSTs to `${apiUrl}/auth/forgot-password` with `{ email }`
 *    on a 202 response, transitions to the success state, and renders the
 *    back-to-signin link with the `locale`-preserved `href="/en/sign-in"`.
 */
describe("ForgotPasswordForm — slice 4 follow-ups (per-form test slim)", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	function renderForm(locale: string = "en"): void {
		render(<ForgotPasswordForm apiUrl="http://api.test" locale={locale} />);
	}

	it("calls the API with the email payload and shows the success state on a 202 response (idempotent — locale-preserved back-to-signin link)", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 202,
			json: async () => ({}),
		});

		renderForm("en");

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
		// The back-to-signin link must be locale-preserved (the design's
		// invariant: 202 collapses BOTH known + unknown emails to the same
		// success copy, with NO enumeration distinction at the form level).
		expect(
			screen.getByRole("link", { name: /auth\.common\.backToLoginLink/i }),
		).toHaveAttribute("href", "/en/sign-in");
	});
});