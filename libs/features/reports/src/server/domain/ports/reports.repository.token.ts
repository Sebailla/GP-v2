/**
 * DI token for `ReportsRepository`.
 *
 * Per the boundary ESLint plugin's `no-cross-module-import` rule, the
 * concrete repository lives in `@features/reports/server` (this slice)
 * and is injected via the NestJS module. The token is the seam between
 * the domain service (which depends on the port) and the infrastructure
 * adapter (which provides the impl). Mirrors the slice-8 auth pattern.
 */

import type { ReportsRepository } from './reports.repository.js';

export const REPORTS_REPOSITORY_TOKEN = Symbol.for('@features/reports/ReportsRepository');

export type ReportsRepositoryToken = typeof REPORTS_REPOSITORY_TOKEN;

/**
 * Type-level helper: given the token, returns the port interface.
 * Used in NestJS module providers via `{ provide: REPORTS_REPOSITORY_TOKEN, useClass: PrismaReportsRepository }`.
 */
export type ReportsRepositoryFor<T> = T extends typeof REPORTS_REPOSITORY_TOKEN ? ReportsRepository : never;
