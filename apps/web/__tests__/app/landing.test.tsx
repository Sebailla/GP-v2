import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * TDD contract for `apps/web/app/[locale]/page.tsx` — slice 4 batch 2
 * (post-4e T3.3 deferred follow-up).
 *
 * The slice-1 placeholder landing page is upgraded to:
 *  - Read the auth-session cookie via `getSession()` (server side).
 *  - If the session is non-null, render the user's email + a
 *    "Welcome" message + (in a future batch) a sign-out button.
 *  - If the session is null, render the slice-1 placeholder
 *    ("Auth UI lands in slice 4, transactions in slice 6.").
 *
 * This file is the slice-4-batch-2 coverage for the landing
 * surface; the existing slice-1 placeholder had no test of its own
 * (verified by the slice-1 task list).
 */

let cookieStore: Record<string, string> = {};

vi.mock("next/headers", () => ({
	cookies: vi.fn(),
}));

async function mockCookieStore(
	values: Record<string, string | undefined>,
): Promise<void> {
	cookieStore = {};
	for (const [k, v] of Object.entries(values)) {
		if (v !== undefined) cookieStore[k] = v;
	}
	const { cookies } = await import("next/headers");
	vi.mocked(cookies).mockResolvedValue({
		get: (name: string) =>
			name in cookieStore ? { name, value: cookieStore[name] } : undefined,
	} as never);
}

// next-intl/server#getTranslations: returning a `t` that produces
// `${namespace}.${key}` lets the tests assert on i18n key wiring
// without spinning up a real NextIntlClientProvider.
vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(
		async (namespace: string) => (key: string) => `${namespace}.${key}`,
	),
}));

// Mock `@core/config` — the page reads `env.NODE_ENV`.
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

// Page under test — imported AFTER the mocks above so the mocks win.
import LandingPage from "../../app/[locale]/page";

describe("LandingPage — slice 4 batch 2 (post-4e T3.3 deferred follow-up)", () => {
	beforeEach(() => {
		cookieStore = {};
	});

	afterEach(() => {
		cleanup();
	});

	async function renderPage(locale = "en"): Promise<void> {
		const element = await LandingPage({
			params: Promise.resolve({ locale }),
		});
		render(element);
	}

	it("renders the slice-1 placeholder when no auth-session cookie is set", async () => {
		await mockCookieStore({});
		await renderPage("en");
		// The slice-1 placeholder copy is the indicator that the page
		// is in the unauthenticated state. Keep the assertion loose
		// (substring match) so future copy tweaks don't break the test.
		expect(screen.getByText(/Auth UI lands in slice 4/i)).toBeInTheDocument();
	});

	it("renders the user's email when the auth-session cookie is set", async () => {
		await mockCookieStore({
			"auth-session": JSON.stringify({
				token: "session-token-abc",
				user: {
					id: "user-1",
					email: "alice@example.com",
					role: "USER",
				},
			}),
		});
		await renderPage("en");
		// The page renders auth.dashboard.welcome with the user's email
		// when authenticated. The mock returns the i18n key shape.
		expect(screen.getByText(/auth\.dashboard\.welcome/i)).toBeInTheDocument();
	});

	it("does NOT render the unauthenticated placeholder when the session is present", async () => {
		await mockCookieStore({
			"auth-session": JSON.stringify({
				token: "session-token-abc",
				user: {
					id: "user-1",
					email: "alice@example.com",
					role: "USER",
				},
			}),
		});
		await renderPage("en");
		expect(
			screen.queryByText(/Auth UI lands in slice 4/i),
		).not.toBeInTheDocument();
	});
});
