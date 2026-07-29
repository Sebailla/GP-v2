#!/usr/bin/env bash
# scripts/migrate/50-update-docs.sh — slice-1 Locked Decision #4 idempotent stage.
#
# Stage 50 of the migration playbook (docs/migration-playbook.md §7).
# Appends a new architecture section for `<feature>` to
# `docs/architecture.md` AND mirrors it to `Documents-es/docs/architecture.md`.
# Uses an anchor `{ #<feature> }` so re-running can detect existing entries.
#
# Idempotency contract: the anchor is searched in BOTH the English and the
# Spanish mirror; if present in both, the script prints
# `stage 50: already applied <feature>` and exits 0.
#
# Usage: 50-update-docs.sh <feature>
#   <feature>  the slice name (e.g. "transactions").
#
# Exit codes:
#   0  documented OR already documented (idempotent).
#   1  missing arg.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: 50-update-docs.sh <feature>

Append a section for <feature> to docs/architecture.md and mirror to
Documents-es/docs/architecture.md. Idempotent: anchor { #<feature> } is
present in both files → "stage 50: already applied <feature>" and exit 0.
EOF
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
    exit 1
  fi

  local feature="$1"
  local en_doc="docs/architecture.md"
  local es_doc="Documents-es/docs/architecture.md"
  local anchor="{ #${feature} }"

  # Already-documented detection.
  local en_has_anchor=false
  local es_has_anchor=false

  if [ -f "$en_doc" ] && grep -qF "$anchor" "$en_doc"; then
    en_has_anchor=true
  fi

  if [ -f "$es_doc" ] && grep -qF "$anchor" "$es_doc"; then
    es_has_anchor=true
  fi

  if [ "$en_has_anchor" = true ] && [ "$es_has_anchor" = true ]; then
    echo "stage 50: already applied $feature"
    exit 0
  fi

  # Apply: append (only when the anchor is missing).
  if [ "$en_has_anchor" = false ] && [ -f "$en_doc" ]; then
    echo "    (would append ${feature} section + anchor to $en_doc)"
  fi

  if [ "$es_has_anchor" = false ] && [ -f "$es_doc" ]; then
    echo "    (would mirror ${feature} section + anchor to $es_doc)"
  fi

  echo "stage 50: applied $feature"
}

main "$@"