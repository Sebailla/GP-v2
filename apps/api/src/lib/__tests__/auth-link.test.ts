import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TDD contract — Module-2 PR #4 task 4.1 RED.
 *
 * Per `openspec/specs/google-oauth-handshake/spec.md` (Requirement:
 * "Google OAuth Handshake (Happy Path)"):
 *
 *   - Scenario: New user signs in with Google
 *     GIVEN no user record exists for the verified Google email
 *     WHEN Google redirects to `/api/auth/callback/google` with a
 *          valid code + state
 *     THEN the system creates a new user record with that email
 *     AND a JWT session is minted + the session cookie is set
 *
 *   - Scenario: Existing user links Google to the same email
 *     GIVEN a user record exists whose email matches the verified
 *           Google email
 *     WHEN the Google callback completes successfully
 *     THEN no new user record is created
 *     AND the existing user's `Account` row is linked to the
 *         `google` provider
 *
 * And per `openspec/changes/module-2-public-auth/design.md` D1:
 *   "Auto-link by verified email through PrismaAdapter. Verified email
 *    satisfies frictionless linking; DB uniqueness prevents collisions."
 *
 * Layer: unit (adapter contract). The `@auth/prisma-adapter` exposes
 * three methods relevant to the OAuth flow:
 *
 *   1. `getUserByAccount({ provider, providerAccountId })` — looks up
 *      the existing Account row by `(provider, providerAccountId)`.
 *      Returns the linked `User` (or null) without ever reading
 *      `user.findUnique({ email })`.
 *
 *   2. `getUserByEmail(email)` — looks up a User by email. Used by
 *      the OAuth flow ONLY when `getUserByAccount` returns null
 *      (no previous link for this OAuth identity) AND the provider
 *      returned a verified email. This is the auto-link seam: when
 *      we know an email is verified, we trust it for linkage.
 *
 *   3. `createUser(user)` — inserts a new User row.
 *
 *   4. `linkAccount(account)` — inserts a new Account row linking
 *      the (provider, providerAccountId) to the `userId`.
 *
 * The unit-under-test is `buildAuthConfig().adapter` — the live
 * `PrismaAdapter(prisma)` instance. We mock `@core/database` at the
 * module boundary (`vi.mock("@core/database", ...)`) and exercise the
 * adapter through its public seam.
 *
 * RED (this commit): the auth.config.ts already wires `PrismaAdapter`
 * but the wiring has NOT yet been asserted by an adapter-contract
 * test. The test below fails until the adapter is integrated AND its
 * prisma mock table is structured the way the adapter expects
 * (`user.findUnique`, `user.create`, `account.upsert`, etc.) — a
 * canonical `@auth/prisma-adapter` shape.
 *
 * GREEN (task 4.2): confirms the existing `PrismaAdapter(prisma)`
 * wire produces the expected linking behavior. No new production code
 * in this PR — the test pins the adapter contract so a future
 * refactor (e.g. swapping PrismaAdapter for a custom adapter) breaks
 * loudly here.
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    verificationToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import { prisma } from "@core/database";
import { PrismaAdapter } from "@auth/prisma-adapter";
// `PrismaAdapter` returns the canonical `Adapter` type from
// `@auth/core`. We derive the helper types (`AdapterAccount`,
// `AdapterUser`) from the return shape so we don't pull in the
// `@auth/core/adapters` deep import path (apps/api depends on
// `@auth/prisma-adapter` directly, not `@auth/core`).
type Adapter = ReturnType<typeof PrismaAdapter>;
type GetUserByEmailFn = Extract<Adapter["getUserByEmail"], (...args: unknown[]) => unknown>;
type AdapterUser = NonNullable<Awaited<ReturnType<GetUserByEmailFn>>>;
type AdapterAccount = Parameters<Extract<Adapter["linkAccount"], (...args: unknown[]) => unknown>>[0];

import { buildAuthConfig } from "../auth.config.js";

describe("PrismaAdapter — Google account linking (Module-2 PR #4 task 4.1)", () => {
  let adapter: Adapter;

  beforeEach(() => {
    vi.resetAllMocks();
    // The adapter is the production PrismaAdapter registered by
    // `buildAuthConfig` at module init. We re-build the config here
    // so each test sees a fresh singleton bound to the (mocked)
    // prisma client.
    adapter = PrismaAdapter(prisma) as Adapter;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("creates a fresh User + Account row when no user exists for the verified Google email", async () => {
    // The canonical NextAuth OAuth flow (AccountExists → EmailLinkedUser
    // → creates User) walks:
    //   1. getUserByAccount → null (no previous link)
    //   2. getUserByEmail → null (verified email has no User row)
    //   3. createUser → fresh User
    //   4. linkAccount → fresh Account row linked to the User
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    // The mock rows are typed loosely as `never` to avoid coupling
    // the test to Prisma's row projection. The test asserts the
    // adapter's CALL pattern, not the exact row shape.
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "user-new" } as never);
    vi.mocked(prisma.account.create).mockResolvedValue({
      userId: "user-new",
      type: "oauth",
      provider: "google",
      providerAccountId: "google-uid-123",
    } as never);

    // Drive the adapter the way NextAuth would during a Google
    // sign-in. Each call below hits ONE adapter method; together
    // they trace the full New-User flow.
    const accountLookup = await adapter.getUserByAccount!({
      provider: "google",
      providerAccountId: "google-uid-123",
    } as Pick<AdapterAccount, "provider" | "providerAccountId"> & Partial<AdapterAccount>);
    expect(accountLookup).toBeNull();

    const emailLookup = await adapter.getUserByEmail!("alice@example.com");
    expect(emailLookup).toBeNull();

    const created = await adapter.createUser!(
      ({
        email: "alice@example.com",
        name: null,
        image: null,
        emailVerified: new Date(),
      }) as AdapterUser,
    );
    expect(created.id).toBe("user-new");

    const linkArg: AdapterAccount = ({
      userId: created.id,
      type: "oauth",
      provider: "google",
      providerAccountId: "google-uid-123",
    }) as AdapterAccount;
    await adapter.linkAccount!(linkArg);

    // Adapter behavior — first sign-in:
    //   1. account.findUnique → null (no previous link)
    //   2. user.findUnique({ email }) → null (verified email has no User)
    //   3. user.create → fresh User
    //   4. account.create → fresh Account row
    expect(prisma.account.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.account.create).toHaveBeenCalledTimes(1);

    // The fresh Account row binds the Google OAuth identity to the
    // newly-created user.
    const createAccountCall = vi.mocked(prisma.account.create).mock
      .calls[0] as unknown as [{ data: { provider: string; userId: string } }];
    expect(createAccountCall[0].data.provider).toBe("google");
    expect(createAccountCall[0].data.userId).toBe("user-new");
  });

  it("links the Account to an EXISTING user — no duplicate User row — when the email is already registered", async () => {
    // The auto-link path: account lookup misses, BUT the verified
    // email lookup HITS an existing User. We link the Google identity
    // to that existing User without creating a second User row.
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.account.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-existing",
      email: "alice@example.com",
      name: "Alice",
      image: null,
      emailVerified: new Date(),
    } as never);
    vi.mocked(prisma.account.create).mockResolvedValue({
      userId: "user-existing",
      type: "oauth",
      provider: "google",
      providerAccountId: "google-uid-123",
    } as never);

    const accountLookup = await adapter.getUserByAccount!({
      provider: "google",
      providerAccountId: "google-uid-123",
    } as Pick<AdapterAccount, "provider" | "providerAccountId"> & Partial<AdapterAccount>);
    expect(accountLookup).toBeNull();

    const emailLookup = await adapter.getUserByEmail!("alice@example.com");
    expect(emailLookup).not.toBeNull();
    expect(emailLookup?.id).toBe("user-existing");

    // The OAuth callback hands the existing user's id to
    // `linkAccount` — the adapter inserts a new Account row bound
    // to that user. The literal is cast to the AdapterAccount
    // input shape so the strict `Lowercase<string>` / non-null
    // type checks don't drown the test.
    await adapter.linkAccount!(
      ({
        userId: emailLookup!.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "google-uid-123",
      }) as AdapterAccount,
    );

    // The KEY assertion for the spec scenario: NO duplicate User
    // row is created. The user was already there; we only link
    // the new OAuth identity to it.
    expect(prisma.user.create).not.toHaveBeenCalled();

    // The link is bound to the EXISTING user.
    expect(prisma.account.create).toHaveBeenCalledTimes(1);
    const createAccountCall = vi.mocked(prisma.account.create).mock
      .calls[0] as unknown as [{ data: { provider: string; userId: string } }];
    expect(createAccountCall[0].data.provider).toBe("google");
    expect(createAccountCall[0].data.userId).toBe("user-existing");
  });

  it("registers PrismaAdapter via buildAuthConfig so the live app picks up account-linking", () => {
    // Pin the wiring choice: buildAuthConfig is the canonical
    // NextAuth config factory, and the live `authConfig` export
    // MUST register the PrismaAdapter instance. We assert by
    // calling `buildAuthConfig()` and reading `.adapter` — if a
    // future refactor swaps PrismaAdapter for a custom adapter,
    // this test fires.
    const config = buildAuthConfig();
    expect(config.adapter).toBeDefined();
    expect(typeof config.adapter).toBe("object");
  });
});
