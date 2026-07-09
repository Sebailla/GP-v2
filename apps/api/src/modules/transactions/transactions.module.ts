import { Module } from "@nestjs/common";
import { createInMemoryDispatcher } from "@core/events";
import { toDecimal } from "@shared-utils/decimal";
import {
	CategoryService,
	DEFAULT_THRESHOLD_AMOUNT,
	FX_RATE_PROVIDER_TOKEN,
	InMemoryFxRateProvider,
	PrismaAuditLogRepository,
	PrismaCategoryRepository,
	PrismaCurrencyRepository,
	PrismaFxRateRepository,
	PrismaIdempotencyRepository,
	PrismaTransactionRepository,
	ThresholdService,
	TotalsService,
	TransactionService,
} from "@features/transactions";
import type { DomainEvent } from "@core/events";
import type { TransactionsEventDispatcher } from "@features/transactions/server/src/events.js";

import { TransactionsController } from "./transactions.controller.js";

/**
 * NestJS module for the transactions feature slice (slice 5 of the
 * vertical-slicing reference).
 *
 * PR #2 (T5.10) wired the FX_RATE_PROVIDER token — the five Prisma
 * repositories and the InMemory FX provider. PR #3 lands the four
 * domain services (T5.9), the REST controller (T5.11), the
 * triangulation suite (T5.12), and the final gate (T5.13).
 *
 * The DI bindings follow the auth slice's pattern (`auth.module.ts`):
 * repositories bind through `useFactory` with no constructor args;
 * services bind through `useFactory` that resolves their port +
 * dispatcher dependencies via `inject`. The event dispatcher is a
 * thin wrapper over `@core/events`'s `createInMemoryDispatcher()` —
 * the same shape `vi.fn()` mocks in tests.
 */
const DEFAULT_SEED_AT = new Date("2026-01-01T00:00:00.000Z");

/**
 * Build a `TransactionsEventDispatcher` (the `(event) => Promise<void> | void`
 * shape the domain services consume) backed by the canonical in-memory
 * dispatcher from `@core/events`. The wrapper exists so the NestJS
 * container can resolve it as a provider; tests inject a `vi.fn()` with
 * the same shape.
 */
function createTransactionsEventDispatcher(): TransactionsEventDispatcher {
	const inner = createInMemoryDispatcher();
	return (event: DomainEvent) => {
		const result = inner.dispatch(event);
		return Promise.resolve(result);
	};
}

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
		{
			provide: PrismaAuditLogRepository,
			useFactory: () => new PrismaAuditLogRepository(),
		},
		{
			provide: "TRANSACTIONS_EVENT_DISPATCHER",
			useFactory: () => createTransactionsEventDispatcher(),
		},
		{
			provide: TransactionService,
			useFactory: (
				txRepo: PrismaTransactionRepository,
				categoryRepo: PrismaCategoryRepository,
				// Slot 3 is the `FxRateProvider` PORT (the runtime `getRate`
				// contract), NOT the `FxRateRepository` port. The DI token
				// `FX_RATE_PROVIDER_TOKEN` resolves to `InMemoryFxRateProvider`
				// in dev/test; a real HTTP-backed impl would replace the
				// binding in production. The previous attempt constructed
				// `new InMemoryFxRateProvider(...)` directly here, which
				// bypassed the FX_RATE_PROVIDER_TOKEN binding — a production
				// override of the token wouldn't have taken effect
				// (R3-004 review finding). The binding is now single-sourced
				// via the inject[] array below.
				fxProvider: InstanceType<typeof InMemoryFxRateProvider>,
				idemRepo: PrismaIdempotencyRepository,
				auditLogRepo: PrismaAuditLogRepository,
				events: TransactionsEventDispatcher,
			) =>
				new TransactionService(
					txRepo,
					categoryRepo,
					fxProvider,
					idemRepo,
					auditLogRepo,
					events,
				),
			inject: [
				PrismaTransactionRepository,
				PrismaCategoryRepository,
				FX_RATE_PROVIDER_TOKEN,
				PrismaIdempotencyRepository,
				PrismaAuditLogRepository,
				"TRANSACTIONS_EVENT_DISPATCHER",
			],
		},
		{
			provide: CategoryService,
			useFactory: (
				categoryRepo: PrismaCategoryRepository,
				auditLogRepo: PrismaAuditLogRepository,
			) => new CategoryService(categoryRepo, auditLogRepo),
			inject: [PrismaCategoryRepository, PrismaAuditLogRepository],
		},
		{
			provide: TotalsService,
			useFactory: (txRepo: PrismaTransactionRepository) =>
				new TotalsService(txRepo),
			inject: [PrismaTransactionRepository],
		},
		{
			provide: ThresholdService,
			useFactory: (events: TransactionsEventDispatcher) =>
				new ThresholdService(
					{ amount: toDecimal(DEFAULT_THRESHOLD_AMOUNT) },
					events,
				),
			inject: ["TRANSACTIONS_EVENT_DISPATCHER"],
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
