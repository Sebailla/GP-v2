#!/usr/bin/env bash
# scripts/migrate/10-extract-domain.sh — slice-1 Locked Decision #4 idempotent stage.
#
# Stage 10 of the migration playbook (docs/migration-playbook.md §3).
# Copies the domain/application/infrastructure folders from the legacy
# `src/modules/<feature>/` layout into the vertical-slicing target at
# `libs/features/<feature>/server/src/`.
#
# Idempotency contract: re-running on a populated target prints
# `stage 10: already applied <feature>` and exits 0. Re-running when the
# legacy source has already been removed also exits 0 with the same
# message — there's no migration to perform.
#
# Usage: 10-extract-domain.sh <feature>
#   <feature>  the slice name (e.g. "transactions").
#
# Exit codes:
#   0  applied OR already applied (idempotent).
#   1  missing arg.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: 10-extract-domain.sh <feature>

Copy src/modules/<feature>/{domain,application,infrastructure}/ into
libs/features/<feature>/server/src/. Re-running on a populated target
prints "stage 10: already applied <feature>" and exits 0.
EOF
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
    exit 1
  fi

  local feature="$1"
  local source_root="src/modules/$feature"
  local target_root="libs/features/$feature/server/src"

  # Already-applied detection: the migration is complete OR the legacy
  # source has been removed. Either way, the work is done.
  if [ ! -d "$source_root" ]; then
    echo "stage 10: already applied $feature"
    exit 0
  fi

  if [ -d "$target_root" ] && [ -n "$(ls -A "$target_root" 2>/dev/null)" ]; then
    echo "stage 10: already applied $feature"
    exit 0
  fi

  # Apply the migration.
  mkdir -p "$target_root"
  for sub in domain application infrastructure; do
    if [ -d "$source_root/$sub" ]; then
      cp -r "$source_root/$sub" "$target_root/$sub"
    fi
  done

  echo "stage 10: applied $feature"
}

main "$@"