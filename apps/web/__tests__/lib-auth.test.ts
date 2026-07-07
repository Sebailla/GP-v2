import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cookies } from "next/headers";

/**
 * TDD contract for `apps/web/lib/auth.ts` — slice 4 batch 2 (post-4e
 * T3.3 deferred follow-up).
 *
 * The web client uses a custom cookie (`auth-session`) to persist the
 * session token + user projection returned by `POST /auth/login` and
 * `POST /auth/register`. The cookie is opaque to the rest of the app;
 * helpers in `auth.ts` are the only surface that reads / writes /
 * clears it.
 *
 * Two distinct execution contexts:
 *  - **Server side** (`getSession`): RSC pages call `cookies()` from
 *    `next/headers` (async in Next.js 15+). The helper decodes the
 *    cookie JSON into a `Session` or returns `null` when the cookie
 *    is absent / malformed.
 *  - **Client side** (`setSessionCookie`, `clearSessionCookie`):
 *    client components call `document.cookie` to write / expire the
 *    cookie. happy-dom's `document.cookie` simulation is enough to
 *    exercise this surface.
 *
 * The cookie name is `auth-session` (NOT NextAuth's
 * `authjs.session-token`) to avoid collisions with a future NextAuth
 * integration — the sessionToken minted by the auth API is a
 * `randomUUID()` string, NOT a NextAuth JWT, so the cookie format is
 * intentionally different.
 */

vi.mock("next/headers", () => ({
	cookies: vi.fn(),
}));

/**
 * Mutable cookie store mirror. The real `cookies()` from
 * `next/headers` returns a request-scoped object; in unit tests we
 * mock it to return a per-test store that we can poke directly.
 */
let cookieStore: Record<string, string> = {};

function mockCookieStore(values: Record<string, string | undefined>): void {
	cookieStore = {};
	for (const [k, v] of Object.entries(values)) {
		if (v !== undefined) cookieStore[k] = v;
	}
	vi.mocked(cookies).mockResolvedValue({
		get: (name: string) =>
			name in cookieStore ? { name, value: cookieStore[name] } : undefined,
	} as never);
}

const {
	getSession,
	setSessionCookie,
	clearSessionCookie,
	AUTH_SESSION_COOKIE,
} = await import("../lib/auth");

const SAMPLE_SESSION = {
	token: "session-token-abc",
	user: { id: "user-1", email: "alice@example.com", role: "USER" },
} as const;

describe("apps/web/lib/auth.ts — session helpers (slice 4 batch 2)", () => {
	// -----------------------------------------------------------------------
	// document.cookie capture helper
	//
	// happy-dom's `document.cookie` GETTER only returns the
	// `name=value` portion of the cookie (matching real-browser
	// behavior) — the attributes (path, max-age, samesite) are stored
	// internally but not observable via the getter. To assert on the
	// full attribute string, we override the setter with a spy that
	// captures the entire input.
	// -----------------------------------------------------------------------
	let lastSetCookie: string | null = null;

	beforeEach(() => {
		cookieStore = {};
		lastSetCookie = null;
		// Replace `document.cookie` with a plain object whose setter
		// captures the input. We keep the getter returning a static
		// placeholder (none of the auth tests rely on the getter after
		// the set).
		Object.defineProperty(document, "cookie", {
			configurable: true,
			get: () => "",
			set: (value: string) => {
				lastSetCookie = value;
			},
		});
	});

	afterEach(() => {
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "",
			writable: true,
		});
	});

	// -----------------------------------------------------------------------
	// getSession — server side
	// -----------------------------------------------------------------------
	describe("getSession()", () => {
		it("returns null when the auth-session cookie is not set", async () => {
			mockCookieStore({});
			const result = await getSession();
			expect(result).toBeNull();
		});

		it("returns the parsed session when the auth-session cookie is set", async () => {
			mockCookieStore({
				[AUTH_SESSION_COOKIE]: JSON.stringify(SAMPLE_SESSION),
			});
			const result = await getSession();
			expect(result).toEqual(SAMPLE_SESSION);
		});

		it("returns null when the cookie value is malformed JSON", async () => {
			mockCookieStore({
				[AUTH_SESSION_COOKIE]: "not-valid-json{{{",
			});
			const result = await getSession();
			expect(result).toBeNull();
		});

		it("returns null when the cookie value is valid JSON but missing the user field", async () => {
			mockCookieStore({
				[AUTH_SESSION_COOKIE]: JSON.stringify({ token: "abc" }),
			});
			const result = await getSession();
			expect(result).toBeNull();
		});

		it("returns null when the cookie value is valid JSON but user is missing email/role", async () => {
			mockCookieStore({
				[AUTH_SESSION_COOKIE]: JSON.stringify({
					token: "abc",
					user: { id: "user-1" },
				}),
			});
			const result = await getSession();
			expect(result).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// setSessionCookie — client side
	// -----------------------------------------------------------------------
	describe("setSessionCookie()", () => {
		it("writes a JSON-encoded session to document.cookie with the canonical name", () => {
			setSessionCookie(SAMPLE_SESSION);
			expect(lastSetCookie).not.toBeNull();
			const cookieStr = String(lastSetCookie);
			const cookieName = AUTH_SESSION_COOKIE;
			expect(cookieStr.startsWith(`${cookieName}=`)).toBe(true);
			const valuePart = cookieStr.split(";")[0] ?? "";
			const encoded = valuePart.split("=").slice(1).join("=");
			let parsed: unknown;
			try {
				parsed = JSON.parse(decodeURIComponent(encoded)) as unknown;
			} catch (error) {
				throw new Error(
					`cookie value did not parse as JSON: ${(error as Error).message}`,
				);
			}
			expect(parsed).toEqual(SAMPLE_SESSION);
		});

		it("writes a 24h Max-Age (86400 seconds) so the cookie survives across page reloads but expires within a day", () => {
			setSessionCookie(SAMPLE_SESSION);
			const cookieStr = String(lastSetCookie);
			expect(cookieStr).toMatch(/max-age=86400/i);
		});

		it("writes the cookie scoped to path=/ so every route in the app sees it", () => {
			setSessionCookie(SAMPLE_SESSION);
			const cookieStr = String(lastSetCookie);
			expect(cookieStr).toMatch(/path=\//i);
		});

		it("writes the cookie with SameSite=Lax so cross-origin POSTs do not include it", () => {
			setSessionCookie(SAMPLE_SESSION);
			const cookieStr = String(lastSetCookie);
			expect(cookieStr).toMatch(/samesite=lax/i);
		});

		it("overwrites a previous auth-session cookie with the new value (last-write-wins)", () => {
			setSessionCookie(SAMPLE_SESSION);
			const NEW_SESSION = {
				token: "session-token-xyz",
				user: { id: "user-2", email: "bob@example.com", role: "USER" },
			};
			setSessionCookie(NEW_SESSION);
			expect(lastSetCookie).not.toBeNull();
			const cookieStr = String(lastSetCookie);
			const valuePart = cookieStr.split(";")[0] ?? "";
			const encoded = valuePart.split("=").slice(1).join("=");
			let parsed: unknown;
			try {
				parsed = JSON.parse(decodeURIComponent(encoded)) as unknown;
			} catch (error) {
				throw new Error(
					`cookie value did not parse as JSON: ${(error as Error).message}`,
				);
			}
			expect(parsed).toEqual(NEW_SESSION);
		});
	});

	// -----------------------------------------------------------------------
	// clearSessionCookie — client side
	// -----------------------------------------------------------------------
	describe("clearSessionCookie()", () => {
		it("writes a Max-Age=0 directive that expires the cookie", () => {
			setSessionCookie(SAMPLE_SESSION);
			clearSessionCookie();
			const cookieStr = String(lastSetCookie);
			const cookieName = AUTH_SESSION_COOKIE;
			expect(cookieStr.startsWith(`${cookieName}=`)).toBe(true);
			expect(cookieStr).toMatch(/max-age=0/i);
		});
	});
});
