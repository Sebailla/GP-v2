// INVALID fixture for no-cross-module-import.
//
// This file IS under libs/features/auth/client and imports directly
// from @features/transactions/server - a DIFFERENT module. The rule
// MUST fire here. The allowed alternative is to route through
// @core/events or a shared port, never to import the other module's
// internals.

import { createTransaction } from "@features/transactions/server";

const handler = createTransaction;
export { handler };
