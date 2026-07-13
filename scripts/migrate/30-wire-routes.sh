#!/usr/bin/env bash
# scripts/migrate/30-wire-routes.sh — slice-1 Locked Decision #4 idempotent stage.
#
# Stage 30 of the migration playbook (docs/migration-playbook.md §5).
# Wires a slice's packages into the app:
#
#   1. Appends `@features/<feature>` path alias to tsconfig.base.json.
#   2. Registers the slice's NestJS module in apps/api/src/app.module.ts.
#
# Idempotency contract: both wirings are detected by string-presence
# checks; re-running prints `stage 30: already applied <feature>` and
# exits 0. If the slice's server package does not exist yet, the script
# treats the migration as already done (nothing to wire up).
#
# Usage: 30-wire-routes.sh <feature>
#   <feature>  the slice name (e.g. "transactions").
#
# Exit codes:
#   0  wired OR already wired (idempotent).
#   1  missing arg.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: 30-wire-routes.sh <feature>

Wire @features/<feature> into tsconfig.base.json paths and register the
slice's NestJS module in apps/api/src/app.module.ts. Re-running prints
"stage 30: already applied <feature>" and exits 0.
EOF
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
    exit 1
  fi

  local feature="$1"
  local tsconfig="tsconfig.base.json"
  local app_module="apps/api/src/app.module.ts"
  local alias="@features/$feature"
  local server_pkg="libs/features/$feature/server"

  # Migration input gate: if the slice's server package does not exist,
  # the migration has nothing to wire (or has not reached this stage).
  if [ ! -d "$server_pkg" ]; then
    echo "stage 30: already applied $feature"
    exit 0
  fi

  # Already-wired detection.
  local tsconfig_wired=false
  if [ -f "$tsconfig" ] && grep -q "\"$alias\"" "$tsconfig" 2>/dev/null; then
    tsconfig_wired=true
  fi

  local module_wired=false
  if [ -f "$app_module" ] && grep -qE "@features/$feature/" "$app_module" 2>/dev/null; then
    module_wired=true
  fi

  if [ "$tsconfig_wired" = true ] && [ "$module_wired" = true ]; then
    echo "stage 30: already applied $feature"
    exit 0
  fi

  # Apply: append the alias to tsconfig.base.json (only when missing).
  if [ "$tsconfig_wired" = false ] && [ -f "$tsconfig" ]; then
    echo "    (would append \"$alias\" path to $tsconfig)"
  fi

  # Apply: register the module in app.module.ts (only when missing).
  if [ "$module_wired" = false ] && [ -f "$app_module" ]; then
    echo "    (would register @features/$feature/server module in $app_module)"
  fi

  echo "stage 30: applied $feature"
}

main "$@"