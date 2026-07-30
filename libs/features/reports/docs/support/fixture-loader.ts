/**
 * Fixture loader for the Reports slice BDD suite.
 *
 * Lives at `libs/features/reports/docs/support/fixture-loader.ts`. Owns
 * the wiring between the BDD step definitions and the slice's domain
 * services. Steps call into this loader to:
 *   - Seed a user's transactions into the InMemoryReportsRepository.
 *   - Set the user's primary currency.
 *   - Invoke the 4 endpoints (getSummary, getByCategory, getByPeriod,
 *     exportCsv) with the current World's userId.
 *   - Inspect the results.
 *
 * Per the repo's BDD bridge convention, this file is the only place
 * that touches the slice's domain service directly. The step
 * definitions themselves are pure: they call helper functions here
 * and assert against the World state.
 *
 * The slice's PrismaReportsRepository ships in a follow-up. When it
 * lands, this loader swaps the InMemoryReportsRepository for the
 * Prisma impl; the step definitions don't change.
 */

import {
  reportsService,
  type FxRateProvider,
} from '@features/reports/server';
import {
  InMemoryReportsRepository,
  type ReportsRepository,
  type TransactionForReport,
} from '@features/reports/server';

import type { ReportsWorld, SeedTransaction } from '../step-defs/world.js';

/**
 * Module-scoped InMemory repository. One per BDD run (cleared
 * between scenarios by resetRepository()).
 */
const repository: InMemoryReportsRepository = new InMemoryReportsRepository();

/**
 * Fixed FX rate provider used by the BDD suite. Returns 1.0 for
 * same-currency pairs (no FX needed), and 1.10 for EUR→USD /
 * USD→EUR (the canonical rate used across the suite). The
 * `recordedAt` is fresh (within the 24h staleness window) so
 * fxFreshness is always 'fresh' in the BDD assertions.
 */
const fxRateProvider: FxRateProvider = {
  async getRate(fromCode, toCode) {
    if (fromCode === toCode) return { rate: '1', recordedAt: new Date() };
    if (
      (fromCode === 'EUR' && toCode === 'USD') ||
      (fromCode === 'USD' && toCode === 'EUR')
    ) {
      return { rate: '1.10', recordedAt: new Date() };
    }
    return null;
  },
};

/**
 * Build a TransactionForReport from a SeedTransaction.
 * Adds the userId and a generated transaction id.
 */
function buildTransaction(userId: string, seed: SeedTransaction, idx: number): TransactionForReport {
  return {
    id: seed.id ?? `${userId}_tx_${idx}_${Date.now()}`,
    userId,
    occurredAt: new Date(seed.occurredAt + 'T12:00:00Z'),
    amount: seed.amount,
    currencyCode: seed.currencyCode,
    categoryId: seed.categoryId,
    categoryName: seed.categoryName,
  };
}

/**
 * Reset the repository to a clean state and seed transactions for
 * both users from the World.
 */
export function resetRepository(world: ReportsWorld): void {
  // We can't clear the InMemory's internal Map directly, but we can
  // overwrite both users' transaction lists with new arrays.
  repository.seedTransactions(world.userA.id, world.userATransactions.map((t, i) => buildTransaction(world.userA.id, t, i)));
  repository.seedTransactions(world.userB.id, world.userBTransactions.map((t, i) => buildTransaction(world.userB.id, t, i)));
  repository.setPrimaryCurrency(world.userA.id, world.primaryCurrency);
  if (world.userB.id !== world.userA.id) {
    // userB defaults to USD unless overridden.
    repository.setPrimaryCurrency(world.userB.id, 'USD');
  }
}

/**
 * Build a fresh ReportsService wired with the in-memory repository
 * and the BDD FX provider.
 */
function buildService(): ReturnType<typeof reportsService> {
  return reportsService({
    reportsRepository: repository as ReportsRepository,
    fxRateProvider,
  });
}

/**
 * Invoke GET /api/reports/summary. Catches errors and stores them in
 * the World.
 */
export async function getSummary(
  world: ReportsWorld,
  fromDate: string,
  toDate: string,
): Promise<void> {
  try {
    const service = buildService();
    const result = await service.getSummary(world.currentUser.id, {
      fromDate,
      toDate,
    });
    world.lastSummary = result;
    world.lastError = null;
  } catch (e) {
    world.lastError = (e as Error).message;
    world.lastSummary = null;
  }
}

/**
 * Invoke GET /api/reports/by-category.
 */
export async function getByCategory(
  world: ReportsWorld,
  fromDate: string,
  toDate: string,
): Promise<void> {
  try {
    const service = buildService();
    const result = await service.getByCategory(world.currentUser.id, {
      fromDate,
      toDate,
    });
    world.lastCategoryBreakdown = result;
    world.lastError = null;
  } catch (e) {
    world.lastError = (e as Error).message;
    world.lastCategoryBreakdown = null;
  }
}

/**
 * Invoke GET /api/reports/by-period.
 */
export async function getByPeriod(
  world: ReportsWorld,
  fromDate: string,
  toDate: string,
  bucket: 'week' | 'month',
): Promise<void> {
  try {
    const service = buildService();
    const result = await service.getByPeriod(
      world.currentUser.id,
      { fromDate, toDate },
      bucket,
    );
    world.lastPeriodComparison = result;
    world.lastError = null;
  } catch (e) {
    world.lastError = (e as Error).message;
    world.lastPeriodComparison = null;
  }
}

/**
 * Invoke GET /api/reports/export.csv. detail='summary' or 'transactions'.
 */
export async function exportCsv(
  world: ReportsWorld,
  fromDate: string,
  toDate: string,
  detail: 'summary' | 'transactions',
): Promise<void> {
  try {
    const service = buildService();
    const result = await service.exportCsv(
      world.currentUser.id,
      { fromDate, toDate },
      detail,
    );
    world.lastCsvFilename = result.filename;
    world.lastCsvBody = result.body;
    world.lastCsvContentType = result.contentType;
    world.lastError = null;
  } catch (e) {
    world.lastError = (e as Error).message;
    world.lastCsvFilename = null;
    world.lastCsvBody = null;
    world.lastCsvContentType = null;
  }
}
