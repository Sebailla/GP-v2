/**
 * World state for the Reports slice BDD suite.
 *
 * Lives at `libs/features/reports/docs/step-defs/world.ts`. Mutated by
 * every step binding across a scenario; reset to fresh state between
 * scenarios by the binding bridge.
 *
 * The World keeps only step-def-facing projections. The full
 * `Transaction` and `SummaryReport` types live in the service layer;
 * the World mirrors just enough to assert.
 *
 * Cross-user isolation invariant: the World has two users (userA,
 * userB). When the scenario says "an authenticated user", the step
 * sets `world.currentUser` to whichever the scenario names. The
 * ReportsService propagates that userId to every repo call.
 */

import type { ReportsSummary, CategoryBreakdownReport, PeriodComparisonReport } from '@features/reports/server';

/**
 * The "currently authenticated" user for this scenario. Defaults to
 * userA. Switched by the "Given ... as the authenticated user" step.
 */
export interface ReportsUser {
  readonly id: string;
  readonly email: string;
  readonly role: 'user' | 'admin';
}

/**
 * One transaction projection, scoped to what the step-defs need.
 * The full Transaction carries more; the World keeps just the
 * amount + currency + categoryId + occurredAt for seeding.
 */
export interface SeedTransaction {
  readonly id?: string;
  readonly amount: string;            // Decimal string, sign-aware
  readonly currencyCode: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly occurredAt: string;          // ISO-8601 (YYYY-MM-DD)
}

/**
 * Reports slice World. Constructed fresh per scenario by the binding
 * bridge.
 */
export interface ReportsWorld {
  /**
   * The current authenticated user. The step defs default to userA
   * unless a scenario explicitly names userB.
   */
  currentUser: ReportsUser;

  /**
   * The two named users in the fixture. userA is the default; userB
   * is used by cross-user isolation scenarios.
   */
  readonly userA: ReportsUser;
  readonly userB: ReportsUser;

  /**
   * Seed transactions for userA, keyed by id. Seeded via the
   * "Given user A has N transactions" step.
   */
  userATransactions: SeedTransaction[];

  /**
   * Seed transactions for userB. Same shape as userA's; defaults
   * to empty.
   */
  userBTransactions: SeedTransaction[];

  /**
   * The user's primary currency code. Set via the "Given user A's
   * primary currency is X" step.
   */
  primaryCurrency: string;

  /**
   * The last response from any of the 4 endpoints. Set by When
   * steps; asserted by Then steps.
   */
  lastSummary: ReportsSummary | null;
  lastCategoryBreakdown: readonly CategoryBreakdownReport[] | null;
  lastPeriodComparison: PeriodComparisonReport | null;
  lastCsvFilename: string | null;
  lastCsvBody: string | null;
  lastCsvContentType: string | null;

  /**
   * Last error message from the controller. Non-null when a step
   * expects the controller to reject a request (e.g., range > 365 days).
   */
  lastError: string | null;
}

/**
 * Construct a fresh World for a new scenario. Two named users are
 * always present (userA is the default authenticated user; userB is
 * the cross-user isolation check).
 */
export function createReportsWorld(): ReportsWorld {
  return {
    currentUser: {
      id: 'userA_id',
      email: 'userA@example.test',
      role: 'user',
    },
    userA: {
      id: 'userA_id',
      email: 'userA@example.test',
      role: 'user',
    },
    userB: {
      id: 'userB_id',
      email: 'userB@example.test',
      role: 'user',
    },
    userATransactions: [],
    userBTransactions: [],
    primaryCurrency: 'USD',
    lastSummary: null,
    lastCategoryBreakdown: null,
    lastPeriodComparison: null,
    lastCsvFilename: null,
    lastCsvBody: null,
    lastCsvContentType: null,
    lastError: null,
  };
}

/**
 * Stable id counter for World fixtures — keeps generated ids
 * deterministic per scenario without leaking into step phrasing.
 */
let __worldCounter = 0;
function nextId(prefix: string): string {
  __worldCounter += 1;
  return `${prefix}_${__worldCounter}`;
}

/**
 * Generate a fresh, deterministic id. Exposed so the fixture-loader
 * can reuse the counter without re-implementing the pattern.
 */
export const idGen = { nextId };
