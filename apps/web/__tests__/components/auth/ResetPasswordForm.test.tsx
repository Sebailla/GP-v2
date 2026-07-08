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
// assert on i18n key wiring without depending on a real IntlProvider.
vi.mock("next-intl", () => ({
	useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `next/navigation` — the form calls `router.replace` on success.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

// Stub `fetch` per test via `vi.fn()`.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Component under test — imported AFTER the mocks above so the mocks win.
import { ResetPasswordForm } from "../../../components/auth/ResetPasswordForm";

/**
 * TDD contract for `apps/web/components/auth/ResetPasswordForm.tsx` —
 * slice 4 follow-ups (per-form test slim).
 *
 * **Form-specific scope.** This file now asserts ONLY the form-specific
 * `token` prop wiring that the consolidated `state-coverage.test.tsx`
 * (T4.14) does not cover: the form passes the URL's `[token]` segment
 * (received via the `token` prop from the page) into the API request
 * body alongside `newPassword`. The state-coverage harness tests the
 * success-state render via `mockFetch.mockResolvedValueOnce(...)`, but it
 * does not pin the request body shape — which is the load-bearing
 * contract for this form (the API rejects the request if `token` is
 * missing or malformed).
 *
 * The 5-state rendering tests for ResetPasswordForm were consolidated
 * into `state-coverage.test.tsx` in slice 4 follow-up cleanup (per the
 * `Decision needed before apply` marker; see apply-progress slice 4
 * follow-ups).
 *
 * (consolidated into state-coverage.test.tsx; see T4.14)
 *  - empty / validation / loading / 401 / 500 rendering
 *    → covered by `state-coverage.test.tsx` ResetPasswordForm describe block.
 *
 * **Form-specific test kept here.**
 *  - The form passes the `token` prop into the API request body alongside
 *    `newPassword`, and on a 200 response calls `router.replace('/${locale}/sign-in')`.
 */
describe("ResetPasswordForm — slice 4 follow-ups (per-form test slim)", () => {
	const TOKEN =
		"abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

	beforeEach(() => {
		mockFetch.mockReset();
		mockReplace.mockReset();
	});

	function renderForm(overrides: { locale?: string; token?: string } = {}): {
		onSuccessRouter: ReturnType<typeof vi.fn>;
	} {
		const locale = overrides.locale ?? "en";
		const token = overrides.token ?? TOKEN;
		render(
			<ResetPasswordForm
				apiUrl="http://api.test"
				token={token}
				locale={locale}
			/>,
		);
		return { onSuccessRouter: mockReplace };
	}

	it("passes the token prop into the API body and navigates to /{locale}/sign-in on 200", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({}),
		});

		const { onSuccessRouter } = renderForm();

		fireEvent.change(
			screen.getByLabelText(/auth\.resetPassword\.newPassword/i),
			{
				target: { value: "new-valid-password-123" },
			},
		);

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.resetPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		// Verify the request shape — POST {apiUrl}/auth/reset-password with
		// { token, newPassword } in the JSON body. The `token` here is the
		// URL's [token] dynamic segment passed via the `token` prop.
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://api.test/auth/reset-password");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			token: TOKEN,
			newPassword: "new-valid-password-123",
		});

		// Success: the form calls router.replace('/{locale}/sign-in').
		await waitFor(() => {
			expect(onSuccessRouter).toHaveBeenCalledWith("/en/sign-in");
		});
	});
});