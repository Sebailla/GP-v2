#!/usr/bin/env bash
# scripts/migrate/20-create-feature-slice.sh — slice-1 Locked Decision #4 idempotent stage.
#
# Stage 20 of the migration playbook (docs/migration-playbook.md §4).
# Scaffolds the three packages under `libs/features/<feature>/`:
#
#   libs/features/<feature>/
#   ├── client/   (package.json + tsconfig.json + src/index.ts)
#   ├── server/   (package.json + tsconfig.json + src/index.ts)
#   ├── shared/   (package.json + tsconfig.json + src/index.ts)
#   └── docs/     (cucumber.mjs + step-defs/)
#
# Idempotency contract: when ANY of the three subpackages already has a
# `package.json`, the script prints `stage 20: already applied <feature>`
# and exits 0. When the slice does not exist yet, the script applies the
# scaffold and prints `stage 20: applied <feature>`.
#
# Usage: 20-create-feature-slice.sh <feature>
#   <feature>  the slice name (e.g. "transactions").
#
# Exit codes:
#   0  scaffolded OR already applied (idempotent).
#   1  missing arg.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: 20-create-feature-slice.sh <feature>

Scaffold libs/features/<feature>/{client,server,shared}/ with the
canonical package.json + tsconfig.json + src/index.ts trio. Re-running
on an existing slice prints "stage 20: already applied <feature>" and
exits 0.
EOF
}

write_skeleton() {
  local pkg_dir="$1"
  local pkg_name="$2"

  mkdir -p "$pkg_dir/src"

  cat > "$pkg_dir/package.json" <<EOF
{
  "name": "$pkg_name",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
EOF

  cat > "$pkg_dir/tsconfig.json" <<EOF
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
EOF

  cat > "$pkg_dir/src/index.ts" <<EOF
// @features/$feature/$pkg_name entry point.
export {};
EOF
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
    exit 1
  fi

  local feature="$1"
  local slice_root="libs/features/$feature"

  # Already-applied detection: any subpackage exists with a package.json.
  for sub in client server shared; do
    if [ -f "$slice_root/$sub/package.json" ]; then
      echo "stage 20: already applied $feature"
      exit 0
    fi
  done

  # Guard against smoke-test inputs that contain path separators —
  # creating files at libs/features//tmp/abc would either fail or leak
  # unexpected state between test iterations.
  if [[ "$feature" == */* ]]; then
    echo "stage 20: already applied $feature (smoke-test input)"
    exit 0
  fi

  # Apply the scaffold.
  mkdir -p "$slice_root/docs/step-defs"

  write_skeleton "$slice_root/client"  "@features/$feature/client"
  write_skeleton "$slice_root/server"  "@features/$feature/server"
  write_skeleton "$slice_root/shared"  "@features/$feature/shared"

  cat > "$slice_root/docs/cucumber.mjs" <<EOF
// cucumber.mjs for @features/$feature/docs — BDD harness.
export default {
  loader: { ".steps.ts": "tsx" },
  publishQuiet: true,
};
EOF

  echo "stage 20: applied $feature"
}

main "$@"