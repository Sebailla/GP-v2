#!/usr/bin/env bash
# scripts/migrate/__tests__/idempotency.test.sh — slice-1 Locked Decision #4 proof.
#
# For each of the 7 migration scripts, this test runs the script twice in
# a row against a fresh temp directory and asserts:
#
#   1. Both invocations exit 0.
#   2. stdout is byte-identical between the two runs (deterministic output).
#
# stderr may differ (timestamps, file paths, etc.) — only stdout is checked.
# Stderr is captured for debugging on failure but not diffed.
#
# Exit codes:
#   0  all 7 scripts idempotent.
#   1  any script failed the contract.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MIGRATE_DIR/.." && pwd)"

SCRIPTS=(
  "00-preflight.sh"
  "10-extract-domain.sh"
  "20-create-feature-slice.sh"
  "30-wire-routes.sh"
  "40-port-tests.sh"
  "50-update-docs.sh"
  "99-finalize.sh"
)

# Each script needs a unique fixture location so the marker files and
# target dirs don't leak between scripts. Use one temp dir per script.
TMPDIR_BASE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BASE"' EXIT

cd "$REPO_ROOT"

failures=0

for script in "${SCRIPTS[@]}"; do
  echo "--- testing $script ---"

  fixture_dir="$TMPDIR_BASE/$script"
  mkdir -p "$fixture_dir"

  first_out="$fixture_dir/first.out"
  first_err="$fixture_dir/first.err"
  second_out="$fixture_dir/second.out"
  second_err="$fixture_dir/second.err"

  # First run.
  if ! bash "$MIGRATE_DIR/$script" "$fixture_dir" >"$first_out" 2>"$first_err"; then
    first_exit=$?
    echo "FAIL: $script first run exited $first_exit" >&2
    cat "$first_err" >&2
    failures=$((failures + 1))
    continue
  fi

  # Second run.
  if ! bash "$MIGRATE_DIR/$script" "$fixture_dir" >"$second_out" 2>"$second_err"; then
    second_exit=$?
    echo "FAIL: $script second run exited $second_exit" >&2
    cat "$second_err" >&2
    failures=$((failures + 1))
    continue
  fi

  # stdout must be byte-identical.
  if ! diff -q "$first_out" "$second_out" >/dev/null 2>&1; then
    echo "FAIL: $script stdout differs between runs" >&2
    diff "$first_out" "$second_out" >&2 || true
    failures=$((failures + 1))
    continue
  fi

  echo "OK: $script idempotent"
done

echo ""

if [ "$failures" -gt 0 ]; then
  echo "IDEMPOTENCY FAIL: $failures script(s) failed the contract" >&2
  exit 1
fi

echo "ALL IDEMPOTENT"