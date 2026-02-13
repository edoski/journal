"""
Screen time section building for daily sync.

Provides functions to parse, cache, merge, and render screen time data from iOS Shortcuts
for daily notes. Follows the same caching pattern as training.py.
"""

from __future__ import annotations


import re

from sync.constants import SCREEN_TIME
from sync.formatting import format_minutes
from sync.models.screen_time import ScreenTimeEntry, DailyScreenTimeData
from sync.models.deviation import DailyDeviationData
from sync.models.status import CanonicalActivityPayload
from sync.ports.cache import DailyScreenTimeCacheStore


def parse_duration_string(duration_str: str) -> float:
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


def parse_activity_line(line: str) -> tuple[str, float] | None:
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
    minutes = parse_duration_string(duration_str)

    return (app_name, minutes)


def parse_activity_field(activity_str: str | None) -> dict[str, float]:
    """
    Parse the full activity field (newline-separated entries) into app -> minutes dict.

    Args:
        activity_str: Full activity string from JSON

    Returns:
        Dict mapping app names to minutes
    """
    if not activity_str:
        return {}

    # Handle multiple segments (e.g. from lunch exclusion) separated by ", "
    # Normalize to newline-separated for consistent line-by-line parsing
    activity_str = activity_str.replace(", ", "\n")

    result: dict[str, float] = {}
    for line in activity_str.split("\n"):
        parsed = parse_activity_line(line)
        if parsed:
            app_name, minutes = parsed
            result[app_name] = result.get(app_name, 0) + minutes

    return result


def _load_screen_time_cache(
    date_str: str,
    cache_store: DailyScreenTimeCacheStore,
) -> dict[str, float]:
    """
    Load cached screen time entries for a given date.

    Args:
        date_str: Date string in YYYY-MM-DD format

    Returns:
        Dict mapping app names to minutes, or empty dict if none
    """
    entries = cache_store.load_for_date(date_str)
    return entries if isinstance(entries, dict) else {}


def _save_screen_time_cache(
    date_str: str,
    entries: dict[str, float],
    cache_store: DailyScreenTimeCacheStore,
) -> None:
    """
    Save screen time entries to cache for a given date.

    Args:
        date_str: Date string in YYYY-MM-DD format
        entries: Dict mapping app names to minutes
    """
    cache_store.save_for_date(date_str, entries)


def _group_by_threshold(
    entries: dict[str, float],
    min_minutes: float,
    percent_threshold: float,
) -> dict[str, float]:
    """
    Group apps into Miscellaneous if they fail either threshold.

    Apps must satisfy BOTH conditions to stay individual:
    - minutes >= min_minutes (absolute threshold)
    - percentage > percent_threshold (relative to total)

    Args:
        entries: Dict mapping app names to minutes
        min_minutes: Minimum minutes to keep individual
        percent_threshold: Minimum percentage of total to keep individual

    Returns:
        Dict with grouped entries
    """
    total = sum(entries.values())
    result: dict[str, float] = {}
    misc_total = 0.0

    for app, minutes in entries.items():
        pct = minutes / total if total > 0 else 0
        if minutes >= min_minutes and pct > percent_threshold:
            result[app] = minutes
        else:
            misc_total += minutes

    if misc_total > 0:
        result[SCREEN_TIME.misc_label] = misc_total

    return result


def load_screen_time_data(
    today_str: str,
    *,
    activity_payload: CanonicalActivityPayload | None,
    screen_time_cache_store: DailyScreenTimeCacheStore,
) -> DailyScreenTimeData | None:
    """
    Load and parse screen time data from iCloud JSON file.

    Merges entries from iPad and iPhone, groups small apps into Miscellaneous,
    and caches the result for persistence across sync runs.

    Args:
        today_str: Date string (YYYY-MM-DD) to load/update cache for

    Returns:
        DailyScreenTimeData with merged entries, or None if no data at all
    """
    new_entries: dict[str, float] = {}
    shortcut_ran = False

    if activity_payload is not None:
        # Shortcut ran and provided data (even if empty)
        shortcut_ran = True
        ipad_apps = parse_activity_field(activity_payload.activity_ipad)
        iphone_apps = parse_activity_field(activity_payload.activity_iphone)
        for app, minutes in ipad_apps.items():
            new_entries[app] = new_entries.get(app, 0) + minutes
        for app, minutes in iphone_apps.items():
            new_entries[app] = new_entries.get(app, 0) + minutes

    # Load cached entries
    cache_entries = _load_screen_time_cache(today_str, screen_time_cache_store)

    # Merge: new entries override cached (same app = replace, not add)
    merged: dict[str, float] = {}
    if new_entries:
        # New data available: merge with cache, cache the result
        merged = {**cache_entries, **new_entries}
        _save_screen_time_cache(today_str, merged, screen_time_cache_store)
    elif cache_entries:
        # No new data, use cache (shortcut may have run previously)
        merged = cache_entries
        shortcut_ran = True  # Cache exists, so shortcut ran at some point

    if not merged and not shortcut_ran:
        # No data and shortcut never ran
        return None

    # Group by dual threshold: must be >= 10 min AND > 5% to stay individual
    grouped = _group_by_threshold(
        merged, SCREEN_TIME.min_minutes, SCREEN_TIME.percent_threshold
    )

    entries = [
        ScreenTimeEntry(app=app, minutes=minutes) for app, minutes in grouped.items()
    ]

    return DailyScreenTimeData(entries=entries, shortcut_ran=shortcut_ran)


def build_procrastination_section(
    screen_time_data: DailyScreenTimeData | None,
    deviation_data: DailyDeviationData | None = None,
) -> list[str]:
    """
    Build the PROCRASTINATION section markdown lines.

    Args:
        screen_time_data: Screen time data, or None if no data
        deviation_data: Schedule deviation data, or None if no deviations

    Returns:
        List of markdown lines for the section
    """
    lines = ["### **PROCRASTINATION**"]

    # No data at all (shortcut never ran)
    if not screen_time_data:
        lines.append("")
        lines.append("_No screen time data available._")
        return lines

    # Compute non-phone deviation: total deviation - screen time
    # (time lost that wasn't spent on phone apps)
    total_deviation = deviation_data.total_minutes if deviation_data else 0.0
    screen_total = screen_time_data.total_minutes
    non_phone_deviation = max(0.0, total_deviation - screen_total)

    # Shortcut ran but zero procrastination apps and no deviations
    if not screen_time_data.entries and non_phone_deviation == 0:
        lines.append("")
        lines.append("| SOURCE      | DURATION    |")
        lines.append("| ----------- | ----------- |")
        lines.append("| **TOTAL** | **`+0m`** |")
        return lines

    lines.append("")
    lines.append("| SOURCE      | DURATION    |")
    lines.append("| ----------- | ----------- |")

    # Build list of (name, minutes) for sorting
    rows: list[tuple[str, float]] = []

    for entry in screen_time_data.entries:
        rows.append((entry.app, entry.minutes))

    # Add DEVIATIONS if > 0 (sorted with entries by value)
    if non_phone_deviation > 0:
        rows.append(("DEVIATIONS", non_phone_deviation))

    # Sort rows descending by minutes
    rows.sort(key=lambda x: x[1], reverse=True)

    # Render sorted rows
    for name, minutes in rows:
        duration_str = f"`+{format_minutes(minutes)}`"
        lines.append(f"| {name} | {duration_str} |")

    # TOTAL row always last (screen time + non-phone deviations)
    total_minutes = screen_total + non_phone_deviation
    total_str = f"**`{format_minutes(total_minutes)}`**"
    lines.append(f"| **TOTAL** | {total_str} |")

    return lines
