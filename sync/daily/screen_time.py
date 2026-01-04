"""
Screen time section building for daily sync.

Provides functions to parse, cache, merge, and render screen time data from iOS Shortcuts
for daily notes. Follows the same caching pattern as training.py.
"""

from __future__ import annotations

import json
import os
import re

from sync.constants import SCREEN_TIME_MIN_MINUTES
from sync.formatting import format_minutes
from sync.models.screen_time import ScreenTimeEntry, DailyScreenTimeData

from .icloud import _load_status_file

# Cache path for screen time entries (same pattern as training)
SCREEN_TIME_CACHE_PATH = os.path.expanduser("~/.cache/journal/screen_time_entries.json")


def _parse_duration_string(duration_str: str) -> float:
    """
    Parse iOS duration strings like "3h 41m", "41m", "59s", "1m30s" to minutes.

    Args:
        duration_str: Duration string from iOS Screen Time

    Returns:
        Duration in minutes (float)
    """
    duration_str = duration_str.strip()
    total_minutes = 0.0

    # Match hours
    hours_match = re.search(r"(\d+)\s*h", duration_str, re.IGNORECASE)
    if hours_match:
        total_minutes += int(hours_match.group(1)) * 60

    # Match minutes
    mins_match = re.search(r"(\d+)\s*m(?!s)", duration_str, re.IGNORECASE)
    if mins_match:
        total_minutes += int(mins_match.group(1))

    # Match seconds
    secs_match = re.search(r"(\d+)\s*s", duration_str, re.IGNORECASE)
    if secs_match:
        total_minutes += int(secs_match.group(1)) / 60

    return total_minutes


def _parse_activity_line(line: str) -> tuple[str, float] | None:
    """
    Parse a single activity line like "Netflix (3h 41m)" into app name and duration.

    Args:
        line: Activity line from iOS Shortcuts

    Returns:
        Tuple of (app_name, minutes) or None if parsing fails
    """
    line = line.strip()
    if not line:
        return None

    # Match "App Name (duration)" pattern
    match = re.match(r"^(.+?)\s*\(([^)]+)\)$", line)
    if not match:
        return None

    app_name = match.group(1).strip()
    duration_str = match.group(2).strip()
    minutes = _parse_duration_string(duration_str)

    return (app_name, minutes)


def _parse_activity_field(activity_str: str | None) -> dict[str, float]:
    """
    Parse the full activity field (newline-separated entries) into app -> minutes dict.

    Args:
        activity_str: Full activity string from JSON

    Returns:
        Dict mapping app names to minutes
    """
    if not activity_str:
        return {}

    result: dict[str, float] = {}
    for line in activity_str.split("\n"):
        parsed = _parse_activity_line(line)
        if parsed:
            app_name, minutes = parsed
            result[app_name] = result.get(app_name, 0) + minutes

    return result


def _load_screen_time_cache(date_str: str) -> dict[str, float]:
    """
    Load cached screen time entries for a given date.

    Args:
        date_str: Date string in YYYY-MM-DD format

    Returns:
        Dict mapping app names to minutes, or empty dict if none
    """
    try:
        with open(SCREEN_TIME_CACHE_PATH, "r") as f:
            obj = json.load(f)
        if obj.get("date") == date_str and isinstance(obj.get("entries"), dict):
            return obj.get("entries") or {}
    except Exception:
        pass
    return {}


def _save_screen_time_cache(date_str: str, entries: dict[str, float]) -> None:
    """
    Save screen time entries to cache for a given date.

    Args:
        date_str: Date string in YYYY-MM-DD format
        entries: Dict mapping app names to minutes
    """
    try:
        os.makedirs(os.path.dirname(SCREEN_TIME_CACHE_PATH), exist_ok=True)
        with open(SCREEN_TIME_CACHE_PATH, "w") as f:
            json.dump({"date": date_str, "entries": entries}, f)
    except Exception:
        pass


def _load_screen_time_data(today_str: str) -> DailyScreenTimeData | None:
    """
    Load and parse screen time data from iCloud JSON file.

    Merges entries from iPad and iPhone, sums duplicates, filters by threshold,
    and caches the result for persistence across sync runs.

    Args:
        today_str: Date string (YYYY-MM-DD) to validate against JSON date

    Returns:
        DailyScreenTimeData with merged entries, or None if no data
    """
    # Try to load new data from status file
    success, data = _load_status_file("activity_status.json")
    
    new_entries: dict[str, float] = {}
    
    if success and data:
        # Validate date matches (data is already in memory, file consumed)
        json_date = data.get("date", "")
        if not json_date or json_date == today_str:
            # Parse both device activity fields
            ipad_apps = _parse_activity_field(data.get("activity_ipad"))
            iphone_apps = _parse_activity_field(data.get("activity_iphone"))

            # Merge by summing durations for same app
            for app, minutes in ipad_apps.items():
                new_entries[app] = new_entries.get(app, 0) + minutes
            for app, minutes in iphone_apps.items():
                new_entries[app] = new_entries.get(app, 0) + minutes

    # Load cached entries
    cache_entries = _load_screen_time_cache(today_str)

    # Merge: new entries override cached (same app = replace, not add)
    merged: dict[str, float] = {}
    if new_entries:
        # New data available: merge with cache, cache the result
        merged = {**cache_entries, **new_entries}
        _save_screen_time_cache(today_str, merged)
    elif cache_entries:
        # No new data, use cache
        merged = cache_entries

    if not merged:
        return None

    # Filter by threshold and create entries
    entries = [
        ScreenTimeEntry(app=app, minutes=minutes)
        for app, minutes in merged.items()
        if minutes >= SCREEN_TIME_MIN_MINUTES
    ]

    if not entries:
        return None

    return DailyScreenTimeData(entries=entries)


def _build_procrastination_section(
    screen_time_data: DailyScreenTimeData | None,
) -> list[str]:
    """
    Build the PROCRASTINATION section markdown lines.

    Args:
        screen_time_data: Screen time data, or None if no data

    Returns:
        List of markdown lines for the section
    """
    lines = ["### **PROCRASTINATION**"]

    if not screen_time_data or not screen_time_data.entries:
        lines.append("")
        lines.append("_No screen time data available._")
        return lines

    lines.append("")
    lines.append("| SOURCE      | DURATION    |")
    lines.append("| ----------- | ----------- |")

    # Sort by duration descending
    sorted_entries = screen_time_data.sorted_entries

    for entry in sorted_entries:
        duration_str = f"`+{format_minutes(entry.minutes)}`"
        lines.append(f"| {entry.app} | {duration_str} |")

    # Total row
    total_minutes = screen_time_data.total_minutes
    total_str = f"**`{format_minutes(total_minutes)}`**"
    lines.append(f"| **TOTAL** | {total_str} |")

    return lines
