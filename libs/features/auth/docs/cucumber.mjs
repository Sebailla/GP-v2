// Cucumber configuration for the auth slice BDD suite (T7.2 step runner).
//
// Lives at `libs/features/auth/docs/cucumber.mjs` per design §4.6. The
// slice's `bdd` script in `libs/features/auth/server/package.json`
// invokes `@cucumber/cucumber` with `--config cucumber.mjs` from inside
// `libs/features/auth/docs/` so the relative paths resolve.
//
// Loader: `@cucumber/cucumber` v13 still ships a CommonJS CLI; the
// `tsx/esm` hook converts the TypeScript step-def files on demand.

import { fileURLToPath } from "node:url";
import path from "node:path";

const docsDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  // Paths is the positional argument the CLI consumes when run from this
  // directory. Each *.feature in `libs/features/auth/docs/*.feature` is
  // independently runnable.
  paths: [path.join(docsDir, "*.feature")],
  // The binding-bridge in `support/register.ts` imports the step-defs
  // and re-publishes each `StepBinding` into cucumber's keyword registry.
  // tsx compiles the .ts on require via the `NODE_OPTIONS=--import tsx/esm`
  // set by the `bdd` script in the slice's package.json.
  require: ["support/register.ts"],
  format: ["summary", "progress"],
  parallel: 0, // serial: BDD scenarios share fixtures in this BDD suite
  worldParameters: {},
  // Tag filter so future re-runs can scope to a subset.
  tags: "not @pending",
  // Stable naming: `-c` in the CLI confirms the config was loaded.
  dryRun: false,
  // Strict mode would fail on missing step bodies; we ship the bindings
  // in T7.1 directly so strict is acceptable.
  strict: true,
};
