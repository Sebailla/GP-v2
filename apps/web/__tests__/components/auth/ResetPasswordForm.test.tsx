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
 * slice 4 batch 4d (T4.11).
 *
 * The form is a client component that:
 *  1. Receives the `token` from the page via props (the page reads
 *     `[token]` from the dynamic segment per Next.js 15 async params).
 *  2. Renders a new-password field bound to
 *     `resetPasswordSchema.shape.newPassword` via `react-hook-form` +
 *     the local `@/lib/zod-resolver` adapter.
 *  3. Renders a submit button with the `auth.resetPassword.submit` label.
 *  4. On submit: validates via `resetPasswordSchema`, then POSTs to
 *     `${apiUrl}/auth/reset-password` with `{ token, newPassword }`.
 *  5. On 200 (success): `router.replace('/{locale}/sign-in')`.
 *  6. On 401 (invalid/expired/consumed token — generic copy per
 *     design §4.1 / D-AUTH-1, no enumeration leak): renders the
 *     form-level `auth.resetPassword.error.invalidToken` banner.
 *  7. On 500 or any non-2xx (or network failure): renders the form-
 *     level `auth.common.genericError` banner.
 *
 * Form states per the T4.11 brief:
 *  1. **Empty** — the new-password field is empty.
 *  2. **Validation-error** — Zod issue surfaces under the field.
 *  3. **Loading** — submit disabled + `auth.common.loading` label.
 *  4. **API-error (401)** — form-level `auth.resetPassword.error.invalidToken`.
 *  5. **API-error (5xx/network)** — form-level `auth.common.genericError`.
 *  6. **Success (200)** — parent-level redirect to `/{locale}/sign-in`.
 */
describe("ResetPasswordForm — slice 4 batch 4d (T4.11)", () => {
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

	it("renders the new-password field + submit button with the expected i18n keys", () => {
		renderForm();

		const newPassword = screen.getByLabelText(
			/auth\.resetPassword\.newPassword/i,
		);
		const submit = screen.getByRole("button", {
			name: /auth\.resetPassword\.submit/i,
		});

		expect(newPassword).toBeInTheDocument();
		expect(newPassword).toHaveAttribute("type", "password");
		expect(submit).toBeInTheDocument();
		expect(submit).toHaveAttribute("type", "submit");
	});

	it("shows a field-level validation error when the user submits an empty new-password", async () => {
		renderForm();

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.resetPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(
				screen.queryByTestId("reset-password-new-password-error"),
			).not.toBeNull();
		});

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("calls the API with the token + new-password and navigates to /{locale}/sign-in on 200", async () => {
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
		// { token, newPassword } in the JSON body.
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

	it("shows the invalidToken error when the API returns 401", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			json: async () => ({}),
		});

		renderForm();

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
			expect(
				screen.getByText(/auth\.resetPassword\.error\.invalidToken/i),
			).toBeInTheDocument();
		});

		// The form MUST NOT navigate on a 401.
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("shows the generic error when the API returns 500", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => ({}),
		});

		renderForm();

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
			expect(
				screen.getByText(/auth\.common\.genericError/i),
			).toBeInTheDocument();
		});

		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("disables the submit button and sets aria-busy='true' while the request is in-flight (loading state)", async () => {
		// Mirror of ForgotPasswordForm's loading test. The fix for
		// R4 #1 (fresh-4R follow-up): the form's JSDoc claims a
		// "Loading" state but no test exercised it before this commit.
		let resolvePromise: (value: Response) => void = () => {};
		mockFetch.mockReturnValueOnce(
			new Promise<Response>((resolve) => {
				resolvePromise = resolve;
			}),
		);

		render(<ResetPasswordForm apiUrl="http://api.test" locale="en" token={TOKEN} />);
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
			expect(
				screen.getByRole("button", {
					name: /auth\.common\.loading/i,
				}),
			).toBeDisabled();
		});

		// Resolve to clean up.
		resolvePromise(
			new Response(JSON.stringify({ id: "user-1" }), { status: 200 }),
		);
	});
});
