#!/bin/bash
# Wrapper script to run all journal sync scripts in sequence
# Called by LaunchAgent com.edo.journalsync

cd /Users/edo/scripts/journal

python3 daily_sync.py
python3 weekly_sync.py
python3 monthly_sync.py
