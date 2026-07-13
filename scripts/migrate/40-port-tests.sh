#!/usr/bin/env bash
# scripts/migrate/40-port-tests.sh — slice-1 Locked Decision #4 idempotent stage.
#
# Stage 40 of the migration playbook (docs/migration-playbook.md §6).
# Ports tests from the legacy `src/modules/<feature>/__tests__/` folder
# into the slice and creates empty BDD feature stubs under
# `libs/features/<feature>/docs/`.
#
# Idempotency contract: the test-count before/after is stable; re-running
# prints `stage 40: already applied <feature>` and exits 0. If the
# legacy test folder does not exist, the migration is treated as already
# done (or never applicable).
#
# Usage: 40-port-tests.sh <feature>
#   <feature>  the slice name (e.g. "transactions").
#
# Exit codes:
#   0  ported OR already ported (idempotent).
#   1  missing arg.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: 40-port-tests.sh <feature>

Copy Vitest suites from src/modules/<feature>/__tests__/ into
libs/features/<feature>/server/src/__tests__/ and scaffold empty BDD
feature stubs under libs/features/<feature>/docs/. Re-running prints
"stage 40: already applied <feature>" and exits 0.
EOF
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
    exit 1
  fi

  local feature="$1"
  local legacy_tests="src/modules/$feature/__tests__"
  local target_tests="libs/features/$feature/server/src/__tests__"
  local docs_dir="libs/features/$feature/docs"

  # Migration input gate: legacy tests do not exist → nothing to port.
  if [ ! -d "$legacy_tests" ]; then
    echo "stage 40: already applied $feature"
    exit 0
  fi

  # Already-ported detection: target tests already exist with content.
  if [ -d "$target_tests" ] && [ -n "$(ls -A "$target_tests" 2>/dev/null)" ]; then
    echo "stage 40: already applied $feature"
    exit 0
  fi

  # Apply: copy Vitest suites.
  mkdir -p "$target_tests"
  if [ -n "$(ls -A "$legacy_tests" 2>/dev/null)" ]; then
    cp -r "$legacy_tests"/. "$target_tests"/
  fi

  # Apply: scaffold empty BDD feature stubs.
  mkdir -p "$docs_dir"
  touch "$docs_dir/login.feature"

  echo "stage 40: applied $feature"
}

main "$@"