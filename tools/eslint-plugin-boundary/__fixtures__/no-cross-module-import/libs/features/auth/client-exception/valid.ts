// TRIANGULATE fixture for no-cross-module-import.
//
// This file IS under libs/features/<x>/** and imports from
// @core/events - the explicit allowed exception. The rule MUST NOT
// fire even though the import reaches into a shared port that lives
// outside the feature module.
//
// Without this exception, every cross-module coordination via
// @core/events would be flagged as a violation, which defeats the
// purpose of the events primitive.

import { dispatch } from "@core/events";

const handler = dispatch;
export { handler };
