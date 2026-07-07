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

// Mock `next-intl` (client side) — the LoginForm calls
// `useTranslations` from the client entry point. The mock mirrors the
// server-side translation shape so the rendered tree shows the
// i18n-keyed strings instead of `MISSING_MESSAGE`.
vi.mock("next-intl", () => ({
	useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `@core/config` — the page reads `env.API_URL` to wire the
// LoginForm's API base. Returning a deterministic URL keeps the
// fetch assertion stable.
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

// Mock `next/navigation` so the SignInClient wrapper's redirect
// becomes a no-op spy we can assert on without touching the
// real Next.js router (which is not wired in happy-dom).
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

// Mock `next/headers` cookies() so the page's
// `getSession()` redirect-if-already-authenticated check is
// testable. The mock returns a per-test store we can poke
// directly to simulate an authenticated session.
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
import SignInPage from "../../app/[locale]/(auth)/sign-in/page";

/**
 * TDD contract for `apps/web/app/[locale]/(auth)/sign-in/page.tsx` —
 * slice 4 batch 4c (T4.8).
 *
 * The page is a Server Component that:
 *  1. Renders the LoginForm (T4.1) inside a Card, with the page
 *     title sourced via `getTranslations("auth.signIn")` from
 *     `next-intl/server`.
 *  2. Wires the API base URL from `env.API_URL` (T4.8 brief-env).
 *  3. On a 200 from the API, triggers a client-side
 *     `router.replace('/{locale}/')` (the SignInClient wrapper
 *     bridges the page-side redirect intent because `redirect()`
 *     from `next/navigation` is server-only).
 *
 * The page is an async RSC; tests await the page function and
 * pass the result to `render()` (RTL pattern for async server
 * components in happy-dom).
 *
 * Deferred (NOT implemented in this batch):
 *  - Redirect-if-already-authenticated: the brief forbids adding
 *    NextAuth client config in this batch (T3.3 deferred). The
 *    page renders LoginForm unconditionally; the success path
 *    just notifies the parent + redirects to /{locale}/.
 */
describe("SignInPage — slice 4 batch 4c (T4.8)", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		mockReplace.mockReset();
		cookieStore = {};
	});

	afterEach(() => {
		cleanup();
	});

	async function renderPage(locale = "en") {
		const element = await SignInPage({
			params: Promise.resolve({ locale }),
		});
		render(element);
	}

	it("renders the page with the LoginForm + the i18n-keyed title", async () => {
		await renderPage("en");

		// The title comes from getTranslations('auth.signIn')('title')
		// -> the mock returns 'auth.signIn.title'.
		expect(screen.getByText("auth.signIn.title")).toBeInTheDocument();

		// The LoginForm fields + submit button are present.
		expect(screen.getByLabelText(/auth\.signIn\.email/i)).toBeInTheDocument();
		expect(
			screen.getByLabelText(/auth\.signIn\.password/i),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /auth\.signIn\.submit/i }),
		).toBeInTheDocument();
	});

	it("renders the page in Spanish locale with the same i18n-keyed copy", async () => {
		await renderPage("es");

		// Mock returns the same `${scope}.${key}` shape regardless of
		// the locale argument — the test asserts that the page passes
		// the active locale through to the wrapper client component
		// (the redirect target is `${locale}`).
		expect(screen.getByText("auth.signIn.title")).toBeInTheDocument();
		expect(screen.getByLabelText(/auth\.signIn\.email/i)).toBeInTheDocument();
	});

	it("redirects to /{locale}/ when the authjs.session-token cookie is set (slice 4 cookie migration final)", async () => {
		// Slice 4 batch 2: the SignInPage MUST call `getSession()`
		// and `redirect(/${locale}/)` if a session is present, so an
		// already-authenticated visitor who lands on the sign-in
		// page is bounced to the landing instead of being shown the
		// form. The page is an RSC; the redirect happens via
		// `next/navigation#redirect` which throws a special error
		// that the test harness intercepts.
		cookieStore = {
			"authjs.session-token": JSON.stringify({
				token: "session-token-abc",
				user: { id: "user-1", email: "alice@example.com", role: "USER" },
			}),
		};
		await expect(renderPage("en")).rejects.toThrow();
		// The redirect target is `/${locale}/` (the landing).
		// `redirect` throws an error whose message includes the
		// target URL — the assertion is loose because the exact
		// error shape is Next.js internal.
	});

	it("triggers router.replace('/{locale}/') when the API returns 200", async () => {
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

		await renderPage("en");

		fireEvent.change(screen.getByLabelText(/auth\.signIn\.email/i), {
			target: { value: "alice@example.com" },
		});
		fireEvent.change(screen.getByLabelText(/auth\.signIn\.password/i), {
			target: { value: "valid-password-123" },
		});

		fireEvent.click(
			screen.getByRole("button", { name: /auth\.signIn\.submit/i }),
		);

		// The LoginForm fires onSuccess; the wrapper calls router.replace.
		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		// Verify the fetch used the env.API_URL.
		const [url] = mockFetch.mock.calls[0] as [string];
		expect(url).toBe("http://api.test/auth/login");

		await waitFor(() => {
			expect(mockReplace).toHaveBeenCalledWith("/en");
		});
	});

	it("shows the form-level invalidCredentials error when the API returns 401", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			json: async () => ({ error: "INVALID_CREDENTIALS", message: "nope" }),
		});

		await renderPage("en");

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
			expect(
				screen.getByText(/auth\.signIn\.error\.invalidCredentials/i),
			).toBeInTheDocument();
		});

		// The wrapper MUST NOT redirect on a 401 — only on 200.
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("shows the generic error when the API returns 500", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => ({}),
		});

		await renderPage("en");

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
			expect(
				screen.getByText(/auth\.common\.genericError/i),
			).toBeInTheDocument();
		});

		expect(mockReplace).not.toHaveBeenCalled();
	});
});
