import { Module } from "@nestjs/common";

import {
	FX_RATE_PROVIDER_TOKEN,
	InMemoryFxRateProvider,
	PrismaAuditLogRepository,
	PrismaCategoryRepository,
	PrismaCurrencyRepository,
	PrismaFxRateRepository,
	PrismaIdempotencyRepository,
	PrismaTransactionRepository,
	CategoryService,
	DEFAULT_THRESHOLD_AMOUNT,
	ThresholdService,
	TotalsService,
	TransactionService,
} from "@features/transactions";
import { createInMemoryDispatcher } from "@core/events";
import { prisma as defaultPrisma } from "@core/database";
import { toDecimal } from "@shared-utils/decimal";

import { TransactionsController } from "./transactions.controller.js";

/**
 * NestJS module for the transactions feature slice (slice 5 of the
 * vertical-slicing reference).
 *
 * PR #2 (T5.10) wired the `FX_RATE_PROVIDER` token + the five Prisma
 * repositories. PR #3 (T5.11) wires the four domain services +
 * the REST controller + the in-memory event dispatcher.
 *
 * Wiring pattern (mirrors `auth.module.ts`):
 *
 *  - `FX_RATE_PROVIDER_TOKEN` is imported from `@features/transactions`
 *    (not declared inline here) — every consumer that resolves the live
 *    FX provider reaches for the same identifier.
 *  - The in-memory event dispatcher is created ONCE at module load time
 *    (per the auth slice's pattern in `auth.module.ts`) and threaded into
 *    every service that dispatches events. Production deployments swap
 *    this binding for a real broker (slice 4+); the slice ships the
 *    in-memory dispatcher per design §4.7.
 *  - The clock defaults to `() => new Date()`. The FX provider receives
 *    a fixed `seededAt` for deterministic test seeding.
 *
 * Threshold default: `DEFAULT_THRESHOLD_AMOUNT` = "1000" per
 * `libs/features/transactions/server/src/constants.ts`. Production
 * deployments override per-`Category.threshold` (slice 6+).
 */
const DEFAULT_SEED_AT = new Date("2026-01-01T00:00:00.000Z");

/**
 * Module-scoped event dispatcher. The InMemoryDispatcher is the
 * reference-repo's pub/sub (slice 3 batch 5 ship); production swaps
 * for a real broker without touching the service code (the
 * `TransactionsEventDispatcher` port is the seam).
 */
const dispatcher = createInMemoryDispatcher();

@Module({
	providers: [
		{
			provide: FX_RATE_PROVIDER_TOKEN,
			useFactory: () => new InMemoryFxRateProvider(DEFAULT_SEED_AT),
		},
		{
			provide: PrismaCurrencyRepository,
			useFactory: () => new PrismaCurrencyRepository(defaultPrisma),
		},
		{
			provide: PrismaFxRateRepository,
			useFactory: () => new PrismaFxRateRepository(defaultPrisma),
		},
		{
			provide: PrismaCategoryRepository,
			useFactory: () => new PrismaCategoryRepository(defaultPrisma),
		},
		{
			provide: PrismaTransactionRepository,
			useFactory: () => new PrismaTransactionRepository(defaultPrisma),
		},
		{
			provide: PrismaIdempotencyRepository,
			useFactory: () => new PrismaIdempotencyRepository(defaultPrisma),
		},
		{
			provide: PrismaAuditLogRepository,
			useFactory: () => new PrismaAuditLogRepository(defaultPrisma),
		},
		{
			provide: TransactionService,
			useFactory: () =>
				new TransactionService(
					new PrismaTransactionRepository(defaultPrisma),
					new PrismaCategoryRepository(defaultPrisma),
					new InMemoryFxRateProvider(DEFAULT_SEED_AT),
					new PrismaIdempotencyRepository(defaultPrisma),
					new PrismaAuditLogRepository(defaultPrisma),
					dispatcher.dispatch,
				),
		},
		{
			provide: CategoryService,
			useFactory: () =>
				new CategoryService(
					new PrismaCategoryRepository(defaultPrisma),
					new PrismaAuditLogRepository(defaultPrisma),
				),
		},
		{
			provide: TotalsService,
			useFactory: () =>
				new TotalsService(new PrismaTransactionRepository(defaultPrisma)),
		},
		{
			provide: ThresholdService,
			useFactory: () =>
				new ThresholdService(
					{ amount: toDecimal(DEFAULT_THRESHOLD_AMOUNT) },
					dispatcher.dispatch,
				),
		},
	],
	controllers: [TransactionsController],
	exports: [
		FX_RATE_PROVIDER_TOKEN,
		PrismaCurrencyRepository,
		PrismaFxRateRepository,
		PrismaCategoryRepository,
		PrismaTransactionRepository,
		PrismaIdempotencyRepository,
		PrismaAuditLogRepository,
		TransactionService,
		CategoryService,
		TotalsService,
		ThresholdService,
	],
})
export class TransactionsModule {
	/**
	 * Re-export of the DI token for callers that already import
	 * `TransactionsModule`. Equivalent to importing `FX_RATE_PROVIDER_TOKEN`
	 * from `@features/transactions`; kept here so consumers can take a
	 * single dependency on the module without reaching into the slice.
	 */
	static readonly FX_RATE_PROVIDER_TOKEN = FX_RATE_PROVIDER_TOKEN;
}
