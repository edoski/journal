#!/bin/bash
# Wrapper script to run all journal sync scripts in sequence
# Called by LaunchAgent com.edo.journalsync

# Ensure Homebrew tools (including Python 3.14) are available
# Shortcuts/launchd don't load shell profiles, so PATH is minimal by default
export PATH="/opt/homebrew/bin:$PATH"

cd /Users/edo/scripts/journal

python3 -m sync.daily
python3 -m sync.periods.weekly
python3 -m sync.periods.monthly
python3 -m sync.periods.quarterly
python3 -m sync.periods.yearly




