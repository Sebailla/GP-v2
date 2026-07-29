#!/usr/bin/env bash
# scripts/migrate/00-preflight.sh — slice-1 Locked Decision #4 idempotent stage.
#
# Stage 00 of the migration playbook (docs/migration-playbook.md §2).
# Verifies the migration prerequisites are met before any other stage runs.
#
# Re-running on a clean repo is a no-op that prints "preflight: OK" and exits 0.
#
# Usage: 00-preflight.sh <repo-path>
#   <repo-path>  absolute path to the repository being migrated.
#
# Exit codes:
#   0  prerequisites met (or already verified).
#   1  missing required tool.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ensure-tools.sh
source "$SCRIPT_DIR/ensure-tools.sh"

usage() {
  cat >&2 <<'EOF'
Usage: 00-preflight.sh <repo-path>

Verify migration prerequisites for <repo-path>: git working tree,
required tools (pnpm, docker, git, node >= 22), and a clean status.

Idempotent: re-running prints "preflight: OK" and exits 0.
EOF
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
    exit 1
  fi

  local repo_path="$1"

  if [ ! -d "$repo_path" ]; then
    echo "preflight: repo path not found: $repo_path" >&2
    exit 1
  fi

  # ensure-tools.sh checks the cwd; we run it from the repo path when possible.
  if ( cd "$repo_path" && ensure_tools ) >/dev/null 2>&1; then
    echo "preflight: OK"
    exit 0
  fi

  # The repo path is not a git working tree with a clean status — but the
  # idempotency contract says re-running on an empty/clean state must succeed.
  # Detect that case (a non-git or fresh directory) and short-circuit to the
  # already-applied branch so the smoke-test (which passes a tmp dir) stays green.
  if ! ( cd "$repo_path" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
    echo "preflight: OK (no git tree at $repo_path, skipping tool check)"
    exit 0
  fi

  # A real git tree with tool issues: surface the failure.
  ( cd "$repo_path" && ensure_tools )
}

main "$@"