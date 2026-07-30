// Cucumber configuration for the reports slice BDD suite.
//
// Lives at `libs/features/reports/docs/cucumber.mjs` per the design
// convention used by @features/auth and @features/transactions. The
// slice's `bdd` script invokes `@cucumber/cucumber` with
// `--config cucumber.mjs` from inside `libs/features/reports/docs/`
// so the relative paths resolve.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const docsDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  // Paths is the positional argument the CLI consumes when run from
  // this directory. Each *.feature in libs/features/reports/docs/*.feature
  // is independently runnable.
  paths: [path.join(docsDir, '*.feature')],
  // The binding-bridge in support/register.ts imports the step-defs
  // and re-publishes each StepBinding into cucumber's keyword registry.
  // tsx compiles the .ts on require via the NODE_OPTIONS=--import
  // tsx/cjs set by the `bdd` script in the slice's package.json.
  require: [path.join(docsDir, 'support', 'register.ts')],
  format: ['summary', 'progress'],
  parallel: 0, // serial: BDD scenarios share the in-memory repository
  worldParameters: {},
  // Tag filter so future re-runs can scope to a subset. The reports
  // slice uses @reports as the suite-level tag. Leaving the filter
  // empty (instead of 'not @pending') so the default run picks up all
  // @reports scenarios without surprises.
  tags: '',
  dryRun: false,
  // Strict mode would fail on missing step bodies; we ship the bindings
  // in this slice so strict is acceptable.
  strict: true,
};
