// INVALID fixture for no-client-server-import.
//
// This file IS under libs/features/auth/client AND imports from
// ../../server/services/auth.service (a /server/ path). The rule
// MUST fire here.

import { login } from "../../server/services/auth.service";

const result = login;
export { result };