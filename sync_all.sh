#!/bin/bash
# Wrapper script to run all journal sync scripts in sequence
# Called by LaunchAgent com.edo.journalsync

set -euo pipefail

# Ensure Homebrew tools are available. launchd jobs do not load shell profiles.
export PATH="/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"
VENV_PY="$REPO_DIR/.venv/bin/python3"

if [[ ! -x "$VENV_PY" ]]; then
  echo "Missing project venv interpreter at $VENV_PY" >&2
  echo "Recreate the venv in $REPO_DIR before running sync." >&2
  exit 1
fi

cd "$REPO_DIR"
export PYTHONPATH="$REPO_DIR"

"$VENV_PY" -m sync.daily
"$VENV_PY" -m sync.periods.weekly
"$VENV_PY" -m sync.periods.monthly
"$VENV_PY" -m sync.periods.quarterly
"$VENV_PY" -m sync.periods.yearly
