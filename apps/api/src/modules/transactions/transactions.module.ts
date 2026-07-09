import { Module } from "@nestjs/common";

import {
	FX_RATE_PROVIDER_TOKEN,
	InMemoryFxRateProvider,
	PrismaCategoryRepository,
	PrismaCurrencyRepository,
	PrismaFxRateRepository,
	PrismaIdempotencyRepository,
	PrismaTransactionRepository,
} from "@features/transactions";

/**
 * NestJS module for the transactions feature slice (slice 5 of the
 * vertical-slicing reference).
 *
 * PR #2 (T5.10) wires the FX_RATE_PROVIDER token — the five Prisma
 * repositories, the InMemory FX provider, and the factories that bind
 * them. PR #3 adds the four domain services (TransactionService /
 * CategoryService / TotalsService / ThresholdService) and the REST
 * controller, plus a JWT guard and the Idempotency-Key validation pipe.
 *
 * The `FX_RATE_PROVIDER_TOKEN` is imported from `@features/transactions`
 * (not declared inline here) — every consumer that resolves the live FX
 * provider reaches for the same identifier. Concrete class refs handle
 * the five repositories via `useFactory`. The pattern mirrors the auth
 * slice's `auth.module.ts`: factories take their constructor args
 * explicitly (the prisma singleton, the seeded clock for the FX
 * provider).
 *
 * Consumer service contract (PR #3):
 *
 *   constructor(
 *     @Inject(FX_RATE_PROVIDER_TOKEN)
 *     private readonly fx: FxRateProvider,
 *   ) {}
 */
const DEFAULT_SEED_AT = new Date("2026-01-01T00:00:00.000Z"); // deterministic seed for tests

@Module({
	providers: [
		{
			provide: FX_RATE_PROVIDER_TOKEN,
			useFactory: () => new InMemoryFxRateProvider(DEFAULT_SEED_AT),
		},
		{
			provide: PrismaCurrencyRepository,
			useFactory: () => new PrismaCurrencyRepository(),
		},
		{
			provide: PrismaFxRateRepository,
			useFactory: () => new PrismaFxRateRepository(),
		},
		{
			provide: PrismaCategoryRepository,
			useFactory: () => new PrismaCategoryRepository(),
		},
		{
			provide: PrismaTransactionRepository,
			useFactory: () => new PrismaTransactionRepository(),
		},
		{
			provide: PrismaIdempotencyRepository,
			useFactory: () => new PrismaIdempotencyRepository(),
		},
	],
	exports: [
		FX_RATE_PROVIDER_TOKEN,
		PrismaCurrencyRepository,
		PrismaFxRateRepository,
		PrismaCategoryRepository,
		PrismaTransactionRepository,
		PrismaIdempotencyRepository,
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
