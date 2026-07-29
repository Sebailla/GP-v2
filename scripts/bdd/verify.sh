#!/usr/bin/env bash
# scripts/bdd/verify.sh — local Node 22 reproduction of the CI BDD gate.
#
# This script is the dev-time equivalent of the BDD (Cucumber) CI job.
# It MUST be run with Node 22.x to mirror the CI environment; Node 23
# hides the tsx/esm CJS-interop bug that this fix targets (Node 23
# bypasses the CJS parse step for files ESM-hooks have registered).
#
# Exit codes:
#   0  all BDD packages passed.
#   1  any package failed.
#   2  Node 22 not available (and the user did not pass --no-node-check).

set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "verify.sh: node not found in PATH" >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${node_major}" -ne 22 ]; then
  if [ "${1:-}" = "--no-node-check" ]; then
    echo "verify.sh: WARNING — running on Node ${node_major}, expected 22" >&2
  else
    echo "verify.sh: requires Node 22.x; current is ${node_major}" >&2
    echo "verify.sh: hint: 'nvm use 22' or 'asdf local nodejs 22.x.x'" >&2
    exit 2
  fi
fi

tsx_version="$(node -p "require('tsx/package.json').version")"
echo "verify.sh: node ${node_major} + tsx ${tsx_version}"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

pnpm turbo run bdd