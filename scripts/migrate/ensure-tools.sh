#!/usr/bin/env bash
# scripts/migrate/ensure-tools.sh — shared helper for the 7 migration scripts.
#
# Verifies the tools a migration stage needs (pnpm, docker, git, node) are
# installed and the repo state is sane. Stages source this file via:
#
#     SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#     # shellcheck source=./ensure-tools.sh
#     source "$SCRIPT_DIR/ensure-tools.sh"
#
# The helper defines a single shell function, `ensure_tools`, that callers
# invoke explicitly. Sourcing does NOT auto-run the check (the caller picks
# the cwd).
#
# Exit codes returned by `ensure_tools`:
#   0  all required tools present (no git dirt)
#   1  missing required tool (or not inside a git working tree)
#   2  working tree is dirty (uncommitted changes)

# This file is meant to be sourced, not executed. When executed directly
# (e.g. via `bash ensure-tools.sh` from a smoke test), it returns 0 with a
# notice instead of running the check.
if [ "${BASH_SOURCE[0]:-}" = "${0}" ]; then
  echo "ensure-tools.sh: sourced helper — call ensure_tools() to run the check" >&2
  exit 0
fi

ensure_tools() {
  local missing=()

  for tool in pnpm docker git node; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing+=("$tool")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "ensure-tools: missing tool(s): ${missing[*]}" >&2
    return 1
  fi

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "${node_major}" -lt 22 ]; then
    echo "ensure-tools: node >= 22 required (got ${node_major})" >&2
    return 1
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ensure-tools: not inside a git working tree" >&2
    return 1
  fi

  if [ -n "$(git status --porcelain)" ]; then
    echo "ensure-tools: working tree is dirty (uncommitted changes)" >&2
    return 2
  fi

  echo "ensure-tools: tools ok"
  return 0
}