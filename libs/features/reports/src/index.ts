/**
 * @features/reports — public API entry point.
 * Re-exports the capability surface (server, client, shared).
 *
 * Consumers should prefer importing the specific subpath:
 *   import { ... } from '@features/reports/server';
 *   import { ... } from '@features/reports/shared';
 *   import { ... } from '@features/reports/client';
 */
export * from '../shared/index.js';
export * from './server/index.js';
export * from './client/index.js';
