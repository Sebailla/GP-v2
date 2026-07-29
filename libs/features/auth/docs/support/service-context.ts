/**
 * In-memory service context for the auth slice BDD runner (PR-7 partial).
 *
 * Per tasks.md T7.9 + the worker's commit 56d2987 design, the BDD
 * step-bodies were dormant markers that mutated a `World` object
 * (no service calls). Slice 7 PR-7 wires the dormant step-bodies to
 * the real `@features/auth` services via in-memory test doubles for
 * the persistence + dispatch edges.
 *
 * Scope of this file (PR-7 PARTIAL):
 *   - AuthService.login — wired to real AuthService in the
 *     `login-email-password.feature` happy path scenario.
 *   - AuthService.register — wired in the `password-reset.feature` and
 *     via the `Given a registered user` Given step.
 *   - SessionService / PasswordResetService — DI-ready (constructors
 *     accept the prisma-like + UserRepository + dispatcher) but the
 *     step-body call sites are deferred to a follow-up commit. The
 *     bridge compiles; the step bodies that exercise these services
 *     continue to mutate the World in the dormant pattern.
 *
 * Per-dev browser install: not required (this is the BDD runner,
 * not the Playwright e2e suite).
 */

// PrismaClient type is NOT imported from @core/database or @prisma/client
// here because the step-defs tsconfig include does not extend the server
// tsconfig's path aliases (per the auto-format / tsconfig setup in
// `libs/features/auth/server/tsconfig.json`'s `include: ["src/**/*.ts",
// "../docs/step-defs/**/*.ts"]`). The services' constructor accepts
// `PrismaClient | undefined` — we pass a structural object that satisfies
// the shape the service exercises; the service captures the reference
// but the in-memory `UserRepository` port short-circuits all user reads
// and writes, so the prisma reference is not actually exercised in
// PR-7 partial.

// AuthService + AuthError live at the BDD scope too — the step bodies
// import the real service + error classes so a failed login throws the
// same AuthError that the production API throws. This means the
// production error contract is exercised verbatim.

// `process` is not in the step-defs tsconfig's lib set, so we set the
// runtime env via a side-effect import in `support/register.ts` (the
// cucumber --require hook runs in node and has process.env access).
// The side-effect import wires the runtime contract; this file stays
// a pure module.

import { AuthService, AuthError } from "../../server/src/auth-service.js";
import type {
  UserRecord,
  UserRepository,
} from "../../server/src/domain/interfaces/user.repository.js";

export { AuthError };

/**
 * Structural type for the minimal PrismaClient surface AuthService
 * touches in this PR-7 partial. Marked `any` for the unused methods
 * (AuthService does not call them through the UserRepository port).
 */
type PrismaLike = {
  user: {
    findUnique: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    create: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    update: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
  };
  session: {
    findUnique: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    findMany: (...args: ReadonlyArray<unknown>) => Promise<ReadonlyArray<unknown>>;
    create: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    delete: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    deleteMany: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
  };
  passwordResetToken: {
    findUnique: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    findMany: (...args: ReadonlyArray<unknown>) => Promise<ReadonlyArray<unknown>>;
    create: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
    delete: (...args: ReadonlyArray<unknown>) => Promise<unknown>;
  };
};

/**
 * Per-scenario mutable state — extends the BDD `World` shape. The
 * service-context is constructed once per support-bridge load; the
 * in-memory repos persist across scenarios inside one process.
 * Each scenario's `world.user` is reset between scenarios by the
 * runner; the service-context + in-memory repos intentionally carry
 * state forward so scenario N can build on what scenario N-1 set up
 * (e.g. register → login).
 */
export interface ServiceContext {
  readonly users: UserRepository;
  readonly authService: AuthService;
}

/**
 * In-memory implementation of the UserRepository port. Stores users
 * in a Map keyed by id; the `email` field is indexed separately to
 * make `findByEmail` an O(1) lookup.
 */
class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();
  private readonly byEmail = new Map<string, UserRecord>();

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    const existing = this.byId.get(id);
    if (existing === undefined) return;
    const next: UserRecord = { ...existing, hashedPassword };
    this.byId.set(id, next);
    if (next.email !== undefined) {
      this.byEmail.set(next.email.toLowerCase(), next);
    }
  }

  /**
   * Internal seed hook used by the `Given a registered user` step
   * bodies to populate the Map. Not part of the port — used only by
   * the test rig.
   *
   * Hashes the supplied password with a synthetic bcrypt-equivalent
   * (constant string). The real AuthService + bcrypt cost 10 runs at
   * registration time; the test rig instead stores an already-hashed
   * sentinel so the login path's `bcrypt.compare` short-circuits with
   * an explicit matcher (`MOCK_PASSWORD_HASH`). See step-defs for
   * the wiring — this is intentionally minimal because AuthService's
   * full contract requires `bcryptjs` + `crypto` modules that are
   * out of scope for the in-memory tests (PR-7 partial).
   */
  seed(record: UserRecord): void {
    const withId: UserRecord = {
      ...record,
      email: record.email ?? `${record.id}@example.test`,
    };
    this.byId.set(withId.id, withId);
    this.byEmail.set((withId.email ?? "").toLowerCase(), withId);
  }
}

/**
 * Synthetic PrismaClient double — minimal interface sufficient for
 * AuthService's `new AuthService(prisma, userRepo)` constructor (the
 * service captures the prisma reference but the in-memory userRepo
 * short-circuits all reads/writes; the prisma reference is not
 * exercised in this PR-7 partial).
 *
 * Type-cast to `unknown → PrismaClient` because the full PrismaClient
 * interface has 30+ methods and the auth services exercise only a
 * small subset (this is the same trade-off the slice 3 integration
 * tests use — the `vi.mock("@core/database")` pattern). The cast
 * makes the fake's incompleteness explicit at the build site.
 */
function buildPrismaLike(): PrismaLike {
  return {
    user: {
      findUnique: async () => null,
      create: async () => {
        throw new Error("InMemoryUserRepository handles user persistence");
      },
      update: async () => {
        throw new Error("InMemoryUserRepository handles user persistence");
      },
    },
    session: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => {
        throw new Error("Session services are deferred to a follow-up");
      },
      delete: async () => {
        throw new Error("Session services are deferred to a follow-up");
      },
      deleteMany: async () => {
        throw new Error("Session services are deferred to a follow-up");
      },
    },
    passwordResetToken: {
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => {
        throw new Error("PasswordReset services are deferred to a follow-up");
      },
      delete: async () => {
        throw new Error("PasswordReset services are deferred to a follow-up");
      },
    },
  };
}

/**
 * Module-level singleton — shared across all scenarios in one
 * cucumber process. The auth slice's services carry their own state
 * via the in-memory repo; the World bridge stores step-level
 * assertions (e.g. `lastErrorMessage`, `sessionCreated`).
 */
const CONTEXT: ServiceContext = (() => {
  const users = new InMemoryUserRepository();
  const prismaLike = buildPrismaLike();
  // AuthService's constructor signature is `(prisma?: PrismaClient,
  // userRepo?: UserRepository)`. We pass the structural PrismaLike
  // (the service captures the reference but the in-memory UserRepository
  // port short-circuits all user reads/writes — the prisma reference is
  // not actually exercised in PR-7 partial).
  const authService = new AuthService(
    prismaLike as unknown as ConstructorParameters<typeof AuthService>[0],
    users,
  );
  return {
    users,
    authService,
  };
})();

/**
 * Get the shared service context.
 */
export function getServiceContext(): ServiceContext {
  return CONTEXT;
}

/**
 * Re-export the bcrypt shortcut used by the in-memory registration
 * path. The synthetic password hash is `{bcrypt-prefix}test-bcrypt`.
 * The step bindings (commit PR-7 partial) hash + compare against this
 * string so the `Given a registered user` step + `When the user
 * submits the sign-in form` pair round-trip through the real
 * AuthService.login shape without needing the real bcryptjs module.
 */
export const MOCK_PASSWORD_HASH = "$2a$10$test-bcrypt-placeholder-hash";
