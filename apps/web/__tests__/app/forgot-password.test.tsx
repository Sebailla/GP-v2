import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
} from "@testing-library/react";

// Mock `next-intl/server#getTranslations` — the page uses the
// server-side translator (RSC). Returning a `t` that produces
// `${namespace}.${key}` lets the tests assert on i18n key wiring
// without spinning up a real NextIntlClientProvider.
vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(
		async (namespace: string) => (key: string) => `${namespace}.${key}`,
	),
}));

// Mock `next-intl` (client side) — the ForgotPasswordForm calls
// `useTranslations` from the client entry point. The mock mirrors the
// server-side translation shape so the rendered tree shows the
// i18n-keyed strings instead of `MISSING_MESSAGE`.
vi.mock("next-intl", () => ({
	useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `@core/config` — the page reads `env.API_URL` to wire the
// ForgotPasswordForm's API base. Returning a deterministic URL keeps
// the fetch assertion stable.
vi.mock("@core/config", () => ({
	env: {
		API_URL: "http://api.test",
		NODE_ENV: "test",
		DATABASE_URL: "postgresql://test@localhost/db",
		NEXTAUTH_URL: "http://localhost:3000",
		NEXTAUTH_SECRET: "x".repeat(32),
		WEB_ORIGIN: "http://localhost:3000",
		PORT: 3001,
	},
}));

// Mock `next/navigation` so any client-side hooks are spies.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

// Mock `next/headers` cookies() so the page's
// getSession() redirect-if-already-authenticated check is
// testable.
let cookieStore: Record<string, string> = {};
const mockCookiesImpl = (): Promise<{
	get: (name: string) => { name: string; value: string } | undefined;
}> => {
	return Promise.resolve({
		get: (name: string) =>
			name in cookieStore
				? { name, value: cookieStore[name] as string }
				: undefined,
	});
};
vi.mock("next/headers", () => ({
	cookies: vi.fn(() => mockCookiesImpl()),
}));

// Stub `fetch` per test via `vi.fn()`.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Page under test — imported AFTER the mocks above so the mocks win.
import ForgotPasswordPage from "../../app/[locale]/(auth)/forgot-password/page";

/**
 * TDD contract for `apps/web/app/[locale]/(auth)/forgot-password/page.tsx` —
 * slice 4 batch 4d (T4.10).
 *
 * The page is a Server Component that:
 *  1. Renders the ForgotPasswordForm inside a Card, with the page title
 *     sourced via `getTranslations("auth.forgotPassword")` from
 *     `next-intl/server`.
 *  2. Wires the API base URL from `env.API_URL`.
 *  3. On 202 (success — both known and unknown emails return 202), the
 *     form transitions to the success state which renders the
 *     `auth.forgotPassword.success` copy + a "Back to sign-in" link
 *     pointing at `/{locale}/sign-in`.
 *
 * The page is an async RSC; tests await the page function and pass
 * the result to `render()`.
 */
describe("ForgotPasswordPage — slice 4 batch 4d (T4.10)", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		mockReplace.mockReset();
		cookieStore = {};
	});

	afterEach(() => {
		cleanup();
	});

	async function renderPage(locale = "en") {
		const element = await ForgotPasswordPage({
			params: Promise.resolve({ locale }),
		});
		render(element);
	}

	it("renders the page with the ForgotPasswordForm + the i18n-keyed title", async () => {
		await renderPage("en");

		expect(screen.getByText("auth.forgotPassword.title")).toBeInTheDocument();
		expect(
			screen.getByLabelText(/auth\.forgotPassword\.email/i),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /auth\.forgotPassword\.submit/i }),
		).toBeInTheDocument();
	});

	it("POSTs to ${API_URL}/auth/forgot-password and shows the success state on 202", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 202,
			json: async () => ({}),
		});

		await renderPage("en");

		fireEvent.change(screen.getByLabelText(/auth\.forgotPassword\.email/i), {
			target: { value: "alice@example.com" },
		});

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.forgotPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://api.test/auth/forgot-password");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			email: "alice@example.com",
		});

		// The success state replaces the form: success copy + back-to-signin link.
		await waitFor(() => {
			expect(
				screen.getByText(/auth\.forgotPassword\.success/i),
			).toBeInTheDocument();
		});
		expect(
			screen.getByRole("link", { name: /auth\.common\.backToLoginLink/i }),
		).toHaveAttribute("href", "/en/sign-in");
	});

	it("renders the back-to-sign-in link with the active locale (es)", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 202,
			json: async () => ({}),
		});

		await renderPage("es");

		fireEvent.change(screen.getByLabelText(/auth\.forgotPassword\.email/i), {
			target: { value: "alice@example.com" },
		});

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.forgotPassword\.submit/i }),
		);

		await waitFor(() => {
			expect(
				screen.getByText(/auth\.forgotPassword\.success/i),
			).toBeInTheDocument();
		});

		expect(
			screen.getByRole("link", { name: /auth\.common\.backToLoginLink/i }),
		).toHaveAttribute("href", "/es/sign-in");
	});

	it("redirects to /{locale}/ when the auth-session cookie is set (slice 4 batch 2 redirect-if-already-authed)", async () => {
		// The user can request a password reset even if they're
		// already authenticated (the brief notes this is a
		// deliberate carve-out — an authed user might want to
		// change their password from a different device). The
		// redirect check on the FORGOT page is therefore
		// optional; we keep the symmetric implementation across
		// the 4 auth pages (sign-in, sign-up, forgot, reset) so
		// an already-authed user doesn't accidentally land on
		// a stale forgot-password form.
		cookieStore = {
			"auth-session": JSON.stringify({
				token: "session-token-abc",
				user: { id: "user-1", email: "alice@example.com", role: "USER" },
			}),
		};
		await expect(renderPage("en")).rejects.toThrow();
	});
});
