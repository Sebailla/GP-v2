import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
} from "@testing-library/react";
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

// Capture document.cookie SETTER so we can assert on the attribute
// string (happy-dom's getter only exposes `name=value`). We replace
// the property's setter with a spy; the spy forwards to the original
// setter so the cookie remains visible via the getter.
let lastSetCookie: string | null = null;
const originalCookieSetter = Object.getOwnPropertyDescriptor(
	Document.prototype,
	"cookie",
)?.set;

beforeEach(() => {
	mockFetch.mockReset();
	lastSetCookie = null;
	const originalGet = Object.getOwnPropertyDescriptor(
		Document.prototype,
		"cookie",
	)?.get;
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
		const originalGet = Object.getOwnPropertyDescriptor(
			Document.prototype,
			"cookie",
		)?.get;
		Object.defineProperty(document, "cookie", {
			configurable: true,
			get: () => originalGet?.call(document) ?? "",
			set: originalCookieSetter,
		});
	}
// Clear any cookie that the test set.
	document.cookie =
		"authjs.session-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

// Component under test — imported AFTER the mocks above so the mocks win.
import { LoginForm } from "../../../components/auth/LoginForm";
import { AUTH_SESSION_COOKIE } from "../../../lib/auth";

/**
 * TDD contract for `apps/web/components/auth/LoginForm.tsx` — slice 4
 * batch 2 (cookie-on-success).
 *
 * **Form-specific scope.** This file now asserts the slice 4 batch 2
 * cookie-on-success wiring: on a 200 response, the form MUST pass a
 * `Session` object (the canonical cookie shape: `{ token, user }`) to
 * the parent's `onSuccess` callback so the parent (SignInClient) can
 * call `setSessionCookie(session)` + `router.replace(/${locale}/)`.
 * The 5-state rendering tests for LoginForm remain consolidated in
 * `state-coverage.test.tsx` (T4.14).
 */
describe("LoginForm — slice 4 batch 2 (cookie-on-success)", () => {
	function renderForm(
		overrides: { onSuccess?: ReturnType<typeof vi.fn>; apiUrl?: string } = {},
	): { onSuccess: ReturnType<typeof vi.fn> } {
		const onSuccess: ReturnType<typeof vi.fn> = overrides.onSuccess ?? vi.fn();
		render(
			<LoginForm
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

	it("calls the API with the form payload and passes a Session to onSuccess on 200", async () => {
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
		let requestBody: unknown;
		try {
			requestBody = JSON.parse(String(init.body)) as unknown;
		} catch (error) {
			throw new Error(
				`request body did not parse as JSON: ${(error as Error).message}`,
			);
		}
		expect(requestBody).toEqual({
			email: "alice@example.com",
			password: "valid-password-123",
		});

		// The form MUST pass a `Session` (the canonical cookie shape) to
		// the parent's onSuccess so the parent can call setSessionCookie +
		// router.replace without re-parsing the API response.
		await waitFor(() => {
			expect(onSuccess).toHaveBeenCalledTimes(1);
		});
		const callArg = onSuccess.mock.calls[0]?.[0] as
			| { token: string; user: { id: string; email: string; role: string } }
			| undefined;
		expect(callArg).toEqual({
			token: "session-token-abc",
			user: { id: "user-1", email: "alice@example.com", role: "USER" },
		});
	});

	it("writes the authjs.session-token cookie to document.cookie on a 200 response", async () => {
		// The form itself persists the session via setSessionCookie
		// BEFORE calling the parent's onSuccess. This test asserts the
		// cookie-set side-effect is observable at the form seam.
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
