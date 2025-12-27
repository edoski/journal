#!/bin/bash
# Wrapper script to run all journal sync scripts in sequence
# Called by LaunchAgent com.edo.journalsync

# Ensure Homebrew tools (including Python 3.14) are available
# Shortcuts/launchd don't load shell profiles, so PATH is minimal by default
export PATH="/opt/homebrew/bin:$PATH"

cd /Users/edo/scripts/journal

python3 -m daily_sync
python3 weekly_sync.py
python3 monthly_sync.py
python3 quarterly_sync.py
python3 yearly_sync.py
