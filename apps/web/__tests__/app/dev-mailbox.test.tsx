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

// Mock `next-intl` (client side) — the DevMailbox client component
// calls `useTranslations` from the client entry point. The mock
// mirrors the server-side translation shape.
vi.mock("next-intl", () => ({
	useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock `@core/config` — the page reads `env.NODE_ENV` to gate the
// production check. Each test overrides the mocked `env.NODE_ENV`
// via the mutable `mockEnv` reference. `vi.hoisted` keeps the
// reference available BEFORE vi.mock runs (vitest hoists `vi.mock`
// above the top-level import section, so a plain `const mockEnv =`
// would throw "Cannot access 'mockEnv' before initialization").
const { mockEnv } = vi.hoisted(() => {
	return {
		mockEnv: {
			API_URL: "http://api.test",
			NODE_ENV: "test",
			DATABASE_URL: "postgresql://test@localhost/db",
			NEXTAUTH_URL: "http://localhost:3000",
			NEXTAUTH_SECRET: "x".repeat(32),
			WEB_ORIGIN: "http://localhost:3000",
			PORT: 3001,
		},
	};
});
vi.mock("@core/config", () => ({
	env: mockEnv,
}));

// Stub `navigator.clipboard.writeText` per test via a vi.fn so the
// copy button can be exercised without touching the real clipboard.
const mockWriteText = vi.fn(async (_: string) => undefined);
Object.defineProperty(globalThis.navigator, "clipboard", {
	configurable: true,
	value: { writeText: mockWriteText },
});

// Component under test — imported AFTER the mocks above so the mocks win.
import DevMailboxPage from "../../app/[locale]/(auth)/dev/mailbox/[userId]/page";

/**
 * TDD contract for
 * `apps/web/app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx` —
 * slice 4 batch 4d (T4.12).
 *
 * The page is a DEV-ONLY Server Component that:
 *  1. Reads `env.NODE_ENV`. If it's `"production"`, the page calls
 *     `notFound()` (Next.js helper → 404). Production builds MUST
 *     never serve this route.
 *  2. In dev/test, the page renders a Card titled
 *     `auth.devMailbox.title` + a list of stubbed reset-token events
 *     for the given `userId` (a module-level constant — the real API
 *     integration lands in slice-5 events full integration; per the
 *     brief, the stub list is documented as "DEV stub — replace with
 *     real API fetch in slice 4 follow-up").
 *  3. Each event row shows: a timestamp, the token (in a `<code>`
 *     element), and a "Copy to clipboard" button. The button uses
 *     `navigator.clipboard.writeText(token)` and shows the
 *     `auth.devMailbox.copiedToClipboard` confirmation for ~2s.
 *  4. When the stub list is empty (no events for the userId), the
 *     page shows the `auth.devMailbox.noTokensHint` hint instead of
 *     the event rows.
 *
 * Tests verify the 4 cases from the brief:
 *  1. Dev: renders the dev-mailbox UI + the stub events.
 *  2. Dev: clicking the Copy button shows the "Copied" confirmation.
 *  3. Production: notFound() fires (we assert the page throws or the
 *     Card is not rendered — the page calls `notFound()` which throws
 *     `NEXT_NOT_FOUND` in Next.js; the test catches the throw).
 *  4. Empty-events state: the noTokensHint is shown.
 *
 * DEFERRED (NOT implemented in this batch):
 *  - Real API call to fetch events from `apps/api` (the API doesn't
 *    expose an event-replay endpoint yet).
 *  - The stub list is module-level — documented inline.
 *  - Production-side access control beyond the NODE_ENV check.
 */
describe("DevMailboxPage — slice 4 batch 4d (T4.12)", () => {
	beforeEach(() => {
		mockEnv.NODE_ENV = "test";
		mockWriteText.mockReset();
		mockWriteText.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	async function renderPage(
		options: { locale?: string; userId?: string; nodeEnv?: string } = {},
	): Promise<void> {
		mockEnv.NODE_ENV = options.nodeEnv ?? "test";
		const element = await DevMailboxPage({
			params: Promise.resolve({
				locale: options.locale ?? "en",
				userId: options.userId ?? "user-1",
			}),
		});
		render(element);
	}

	it("in dev: renders the page with the dev-mailbox UI + the stub events for the given userId", async () => {
		await renderPage({ userId: "user-1" });

		expect(screen.getByText("auth.devMailbox.title")).toBeInTheDocument();
		// The stub list (slice-4 batch-4d dev placeholder) shows >=1 event
		// for user-1. Each row carries a copy button + a <code> token.
		const copyButtons = screen.getAllByRole("button", {
			name: /auth\.devMailbox\.copyButton/i,
		});
		expect(copyButtons.length).toBeGreaterThanOrEqual(1);

		// The first stubbed token surfaces in a <code> element.
		const codeEl = screen.getAllByTestId(/^dev-mailbox-token-/);
		expect(codeEl.length).toBeGreaterThanOrEqual(1);
	});

	it("in dev: clicking the Copy button writes the token to the clipboard and shows the 'Copied' confirmation", async () => {
		await renderPage({ userId: "user-1" });

		const copyButtons = screen.getAllByRole("button", {
			name: /auth\.devMailbox\.copyButton/i,
		});
		expect(copyButtons.length).toBeGreaterThanOrEqual(1);

		fireEvent.click(copyButtons[0]!);

		await waitFor(() => {
			expect(mockWriteText).toHaveBeenCalledTimes(1);
		});

		// The token that was written should match the token rendered in
		// the corresponding row's <code> element. We don't tie the index
		// to the order (the stub list is internal) — we just confirm the
		// write happened with a non-empty hex-shaped token.
		const written = mockWriteText.mock.calls[0]?.[0] as string | undefined;
		expect(typeof written).toBe("string");
		expect(written!.length).toBeGreaterThanOrEqual(32);

		// The "Copied" confirmation surfaces (role=status, aria-live=polite).
		await waitFor(() => {
			expect(
				screen.getAllByText(/auth\.devMailbox\.copiedToClipboard/i).length,
			).toBeGreaterThanOrEqual(1);
		});
	});

	it("in production: the page renders the notFound() helper (the Card title MUST NOT appear)", async () => {
		// Override NODE_ENV to production BEFORE rendering so the page's
		// env.NODE_ENV check trips `notFound()`.
		mockEnv.NODE_ENV = "production";

		// The page calls `notFound()` from `next/navigation`, which throws
		// a special Next.js error to short-circuit rendering. The page
		// function itself may throw, OR the resulting React tree may
		// render a "not-found" marker. We accept either:
		//   (a) the page function rejects with NEXT_NOT_FOUND, OR
		//   (b) the page renders without the dev-mailbox Card title.
		let threw = false;
		let element: React.JSX.Element | undefined;
		try {
			element = await DevMailboxPage({
				params: Promise.resolve({ locale: "en", userId: "user-1" }),
			});
		} catch {
			threw = true;
		}

		if (!threw && element !== undefined) {
			render(element);
			expect(screen.queryByText("auth.devMailbox.title")).toBeNull();
		}
		// Either path proves the dev mailbox is NOT visible in production.
		expect(threw || screen.queryByText("auth.devMailbox.title") === null).toBe(
			true,
		);
	});

	it("in dev with an empty stub list for the userId: shows the noTokensHint", async () => {
		// The stub list is keyed by userId; we use a userId that the stub
		// does NOT contain so the list is empty and the noTokensHint fires.
		await renderPage({ userId: "user-with-no-events" });

		expect(screen.getByText("auth.devMailbox.title")).toBeInTheDocument();
		expect(
			screen.getByText(/auth\.devMailbox\.noTokensHint/i),
		).toBeInTheDocument();
		// No copy buttons when the stub list is empty.
		expect(
			screen.queryAllByRole("button", {
				name: /auth\.devMailbox\.copyButton/i,
			}).length,
		).toBe(0);
	});
});
