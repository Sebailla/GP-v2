// Cucumber configuration for the transactions slice BDD suite (T7.4 step runner).
//
// Lives at `libs/features/transactions/docs/cucumber.mjs` per design §5.6.
// Mirrors the auth slice's config pattern so the two suites behave
// consistently.

import { fileURLToPath } from "node:url";
import path from "node:path";

const docsDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  paths: [path.join(docsDir, "*.feature")],
  // The binding-bridge in `support/register.ts` imports the step-defs
  // and re-publishes each `StepBinding` into cucumber's keyword registry.
  require: [path.join(docsDir, "support", "register.ts")],
  format: ["summary", "progress"],
  parallel: 0, // serial: BDD scenarios share fixtures in this BDD suite
  worldParameters: {},
  tags: "not @pending",
  strict: true,
  // Per-feature gate evidence (G8) is collected into `bdd-reports/**`
  // by the per-slice `bdd` script in `libs/features/transactions/server/package.json`.
  dryRun: false,
};
