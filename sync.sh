#!/bin/bash
# Run journal sync entrypoints in sequence.
# Called by LaunchAgent com.edo.journalsync.

set -euo pipefail

# Ensure Homebrew tools are available. launchd jobs do not load shell profiles.
export PATH="/opt/homebrew/bin:$PATH"

LOG_CAP_BYTES="${JOURNAL_LOG_CAP_BYTES:-262144}"
if ! [[ "$LOG_CAP_BYTES" =~ ^[0-9]+$ ]] || (( LOG_CAP_BYTES <= 0 )); then
  LOG_CAP_BYTES=262144
fi

cap_log_file() {
  local log_path="$1"
  local cap_bytes="$2"

  [[ -f "$log_path" ]] || return 0

  local size=""
  size="$(stat -f%z "$log_path" 2>/dev/null || stat -c%s "$log_path" 2>/dev/null || echo 0)"
  [[ "$size" =~ ^[0-9]+$ ]] || return 0
  (( size > cap_bytes )) || return 0

  local tmp_path="${log_path}.tmp"
  if tail -c "$cap_bytes" "$log_path" > "$tmp_path"; then
    mv "$tmp_path" "$log_path"
  else
    rm -f "$tmp_path"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PY="$SCRIPT_DIR/.venv/bin/python3"

if [[ ! -x "$VENV_PY" ]]; then
  echo "Missing project venv interpreter at $VENV_PY" >&2
  echo "Recreate the venv in $SCRIPT_DIR before running sync." >&2
  exit 1
fi

cd "$SCRIPT_DIR"

cap_log_file "/tmp/com.edo.journal.out" "$LOG_CAP_BYTES"
cap_log_file "/tmp/com.edo.journal.err" "$LOG_CAP_BYTES"

"$VENV_PY" -m sync.daily
"$VENV_PY" -m sync.periods.weekly
"$VENV_PY" -m sync.periods.monthly
"$VENV_PY" -m sync.periods.quarterly
"$VENV_PY" -m sync.periods.yearly
