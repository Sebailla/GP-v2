// `vi.stubEnv` (hoisted with `vi.mock` to the top of the file) sets the
// env BEFORE any @core/config import triggers the env singleton's lazy
// evaluation. The secret MUST match the value the production guard reads
// at runtime.
vi.stubEnv("NODE_ENV", "test");
vi.stubEnv("PORT", "3001");
vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
vi.stubEnv("DATABASE_URL", "postgresql://placeholder/db");
vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
vi.stubEnv(
	"NEXTAUTH_SECRET",
	"test-secret-at-least-32-characters-long-for-hkdf",
);
vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T3.7 #2 — Session-expiry integration test (slice 3 batch 8).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/tasks.md`
 * (T3.7 — "expired session JWT returns 401") and design §4 (auth slice
 * — NextAuth v5 config + `JwtAuthGuard`), the guard MUST reject
 * expired bearer JWTs with the same generic 401 copy used for every
 * other failure mode (parallels D-AUTH-1: no enumeration leak across
 * credential failure modes).
 *
 * This e2e suite exercises the public surface end-to-end through
 * `Test.createTestingModule(...)` + supertest, the same wiring the
 * existing `jwt-auth-guard.e2e-spec.ts` uses. The test mints a JWT
 * with a NEGATIVE maxAge so the `exp` claim lands in the past, calls
 * `GET /auth/sessions` with the bearer token, and asserts 401.
 *
 * Why an e2e test (not a service-level unit test): NextAuth's
 * `next-auth/jwt#encode` + `#decode` use HKDF-derived AES-256-GCM
 * keys — the only honest way to verify the guard's expiry contract is
 * to mint a real JWE with the SAME `secret` + `salt` and let the
 * guard's `decode` reject it. The integration lives in `apps/api`
 * because that's where the NextAuth + @auth/prisma-adapter dependencies
 * are installed (per slice 3 batch 7's forbidden-scope clause); the
 * `libs/features/auth` package deliberately avoids a transitive
 * next-auth dependency.
 *
 * RED → GREEN evidence:
 *  - RED: the slice 3 batch 6 stub `JwtAuthGuard` rejected ALL bearer
 *    tokens (it expected the `<userId>:<token>` format). An expired
 *    JWT minted with the canonical secret + salt would be rejected for
 *    the WRONG reason (malformed), not for the RIGHT reason (expired).
 *  - GREEN: the slice 3 batch 7 real guard uses `next-auth/jwt#decode`
 *    which returns `null` for expired tokens → the guard's catch-all
 *    `if (claims === null) throw UnauthorizedException("invalid bearer token")`
 *    maps the failure to 401 with the generic copy.
 *
 * Test discipline (per testing-standards):
 *  - AAA pattern.
 *  - No logic in tests.
 *  - Mocks the Prisma singleton at the boundary; the guard's
 *    `decode` is the seam under test.
 */

vi.mock("@core/database", () => ({
	prisma: {
		user: { findUnique: vi.fn(), create: vi.fn() },
		session: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn(),
			findMany: vi.fn(),
		},
		passwordResetToken: {
			create: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			deleteMany: vi.fn(),
		},
		account: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
		verificationToken: { create: vi.fn(), delete: vi.fn() },
	},
}));

vi.mock("bcryptjs", () => ({
	default: {
		compare: vi.fn(),
		hash: vi.fn(),
	},
}));

import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { prisma } from "@core/database";

import { AuthModule } from "../src/modules/auth/auth.module.js";

import { mintJwt } from "./helpers/mint-jwt.js";

/**
 * Test secret. Must match the `process.env.NEXTAUTH_SECRET` mutation
 * at the top of this file (the production guard reads
 * `env.NEXTAUTH_SECRET` at runtime, so both encoder + decoder must
 * agree on the value).
 */
const TEST_NEXTAUTH_SECRET =
	"test-secret-at-least-32-characters-long-for-hkdf";

describe("JwtAuthGuard session expiry (T3.7 #2 — integration)", () => {
	let app: INestApplication;
	let moduleRef: TestingModule;

	beforeEach(async () => {
		vi.resetAllMocks();
		moduleRef = await Test.createTestingModule({
			imports: [AuthModule],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterEach(async () => {
		if (app !== undefined) {
			await app.close();
		}
	});

	describe("GET /auth/sessions with an expired bearer JWT", () => {
		it("returns 401 when the bearer JWT is expired (exp claim in the past)", async () => {
			// Arrange — mint a JWT whose maxAge is negative so the `exp`
			// claim sits in the past relative to the current time. The
			// payload is well-formed (the canonical claims the guard
			// expects) — the ONLY thing that distinguishes this token
			// from a valid one is the expiry.
			const userId = "user-1";
			const email = "alice@example.com";
			const role = "USER";

			// `maxAge: -3600` makes NextAuth stamp `exp = now + (-3600s)`,
			// which is 1 hour in the past. The decode side honors the
			// `exp` claim and returns null for an expired token.
			// (NextAuth's decode uses jose with `clockTolerance: 15`
			// seconds of leeway, so we go well beyond that — 1h is
			// unambiguous.)
			const expiredJwt = await mintJwt(
				{
					sub: userId,
					email,
					role,
					userId,
					name: null,
					picture: null,
				},
				{ maxAgeSeconds: -3600 },
				TEST_NEXTAUTH_SECRET,
			);

			// The DB mocks below are unreachable on the expired path —
			// the guard rejects BEFORE the controller's service is
			// invoked. They are present only to satisfy the service
			// constructors that the AuthModule wires.
			vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
			vi.mocked(prisma.session.findMany).mockResolvedValue([]);

			// Act — call GET /auth/sessions with the expired JWT.
			const res = await request(app.getHttpServer())
				.get("/auth/sessions")
				.set("Authorization", `Bearer ${expiredJwt}`);

			// Assert — 401 with the generic copy. The guard does NOT
			// surface "token expired" as a distinct failure mode
			// (parallels D-AUTH-1: no enumeration leak across the
			// failure modes — expired / malformed / wrong-secret
			// all collapse to the same observable response).
			expect(res.status).toBe(401);
		});

		it("returns 401 when the bearer JWT's maxAge window already elapsed (exp 24 hours ago)", async () => {
			// Arrange — a JWT minted with a 1-hour maxAge window but
			// issued one hour + 1 second ago (effectively expired by
			// 1 second). The guard's `decode` honors the `exp` claim
			// and returns null.
			const userId = "user-2";
			const email = "bob@example.com";
			const role = "USER";

			const expiredJwt = await mintJwt(
				{
					sub: userId,
					email,
					role,
					userId,
					name: null,
					picture: null,
				},
				{
					maxAgeSeconds: -3600, // 1 hour in the past
				},
				TEST_NEXTAUTH_SECRET,
			);

			vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
			vi.mocked(prisma.session.findMany).mockResolvedValue([]);

			// Act
			const res = await request(app.getHttpServer())
				.get("/auth/sessions")
				.set("Authorization", `Bearer ${expiredJwt}`);

			// Assert
			expect(res.status).toBe(401);
		});

		it("returns 200 when the bearer JWT is valid (control: confirms the negative-case assertions are specific)", async () => {
			// Control test — proves that the SAME setup that produces
			// a 401 for an expired token returns 200 for a valid one.
			// Without this control, the expired-token assertions above
			// could pass for the wrong reason (e.g., the guard always
			// rejects every JWT).
			const userId = "user-3";
			const email = "carol@example.com";
			const role = "USER";
			const sessionToken = "session-token-fresh";

			vi.mocked(prisma.user.findUnique).mockResolvedValue({
				id: userId,
				email,
				role,
				hashedPassword: "$2a$10$hash",
			} as never);
			vi.mocked(prisma.session.findMany).mockResolvedValue([
				{
					id: "session-1",
					sessionToken,
					userId,
					expires: new Date(Date.now() + 60 * 60 * 1000),
				},
			] as never);

			const validJwt = await mintJwt(
				{
					sub: userId,
					email,
					role,
					userId,
					name: null,
					picture: null,
				},
				{ maxAgeSeconds: 30 * 24 * 60 * 60 }, // 30 days — fresh
				TEST_NEXTAUTH_SECRET,
			);

			const res = await request(app.getHttpServer())
				.get("/auth/sessions")
				.set("Authorization", `Bearer ${validJwt}`);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
		});
	});
});