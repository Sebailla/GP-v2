/**
 * DI tokens for the transactions feature slice.
 *
 * Lives in the slice (not in `apps/api`) so consumers import a const, not
 * a string literal. This keeps the convention honest and prevents string
 * drift across bound surfaces — NestJS modules and services both reach
 * for the same identifier.
 *
 * Mirror: the `apps/api/src/modules/transactions/transactions.module.ts`
 * `provide:` and `exports:` arrays bind to this token through:
 *
 *   import { FX_RATE_PROVIDER_TOKEN } from "@features/transactions";
 *   { provide: FX_RATE_PROVIDER_TOKEN, useFactory: ... }
 *
 * Slice 5 PR #3 services consume the provider via:
 *
 *   constructor(
 *     @Inject(FX_RATE_PROVIDER_TOKEN)
 *     private readonly fx: FxRateProvider,
 *   ) {}
 */

/**
 * Inversion-of-control token used by NestJS to resolve the live FX rate
 * provider (`FxRateProvider` port) inside `TransactionsModule`. Resolves
 * to the canonical `InMemoryFxRateProvider` in development + tests; a
 * real adapter (HTTP-backed, cache-aware) can replace it without
 * touching the slice's domain code.
 */
export const FX_RATE_PROVIDER_TOKEN = "FX_RATE_PROVIDER" as const;

/**
 * Compile-time alias for the token literal. Useful in tests + service
 * decorators where the literal narrowing is needed.
 */
export type FxRateProviderToken = typeof FX_RATE_PROVIDER_TOKEN;
