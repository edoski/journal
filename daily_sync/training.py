"""
Training section building for daily sync.

Provides functions to parse, cache, merge, and render training (workout/stretch)
data for daily notes.
"""
from __future__ import annotations

import json
import os
import re
from collections import OrderedDict
from typing import Any

from sync_utils import format_minutes_seconds

from .constants import TRAINING_CACHE_PATH


# Type alias for training entries
TrainingEntry = dict[str, Any]


def _parse_training_table(block_lines: list[str] | None) -> list[TrainingEntry]:
    """
    Convert an existing TRAINING table into structured entries.

    Args:
        block_lines: Lines from an existing training block, or None

    Returns:
        List of training entry dicts with keys: start, end, time_raw, activity, duration, calories
    """
    if block_lines is None:
        return []
    entries: list[TrainingEntry] = []
    header_re = re.compile(r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|", re.IGNORECASE)
    header_idx = -1
    for idx, line in enumerate(block_lines):
        if header_re.search(line):
            header_idx = idx
            break
    if header_idx == -1:
        return entries

    row_start = header_idx + 2
    for line in block_lines[row_start:]:
        if not line.lstrip().startswith("|"):
            break
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        raw_time = parts[1].strip("` ").replace("`", "")
        activity = parts[2]
        duration = parts[3].strip("` ").replace("`", "")
        calories = parts[4].strip("` ").replace("`", "")

        start_val: str | None = None
        end_val: str | None = None
        time_match = re.match(r"^([0-2]\d:[0-5]\d)(?:\s*-\s*([0-2]\d:[0-5]\d))?$", raw_time)
        if time_match:
            start_val = time_match.group(1)
            end_val = time_match.group(2)

        entries.append({
            "start": start_val,
            "end": end_val,
            "time_raw": raw_time,
            "activity": activity,
            "duration": duration,
            "calories": calories,
        })
    return entries


def _load_training_cache(date_str: str) -> list[TrainingEntry]:
    """
    Load cached training entries for a given date.

    Args:
        date_str: Date string in YYYY-MM-DD format

    Returns:
        List of cached training entries, or empty list if none
    """
    try:
        with open(TRAINING_CACHE_PATH, "r") as f:
            obj = json.load(f)
        if obj.get("date") == date_str and isinstance(obj.get("entries"), list):
            return obj.get("entries") or []
    except Exception:
        pass
    return []


def _save_training_cache(date_str: str, entries: list[TrainingEntry]) -> None:
    """
    Save training entries to cache for a given date.

    Args:
        date_str: Date string in YYYY-MM-DD format
        entries: List of training entries to cache
    """
    try:
        os.makedirs(os.path.dirname(TRAINING_CACHE_PATH), exist_ok=True)
        with open(TRAINING_CACHE_PATH, "w") as f:
            json.dump({"date": date_str, "entries": entries}, f)
    except Exception:
        pass


def _activity_entries_from_data(
    data: dict | list | None,
    default_activity_label: str,
) -> list[TrainingEntry]:
    """
    Normalize workout/stretch JSON payloads into training table entries.

    Args:
        data: Raw JSON data from status file (dict or list of dicts)
        default_activity_label: Default activity name (e.g., "Workout", "Stretching")

    Returns:
        List of normalized training entries
    """
    entries_out: list[TrainingEntry] = []
    if not data:
        return entries_out
    try:
        source_entries = data if isinstance(data, list) else [data]
        for entry in source_entries:
            start_raw = (entry.get("start") or "").strip()
            end_raw = (entry.get("end") or "").strip()
            dur_val = entry.get("duration")
            kcal_val = entry.get("kcal")
            activity_val = entry.get("type") or default_activity_label

            duration_fmt = ""
            if dur_val is not None:
                duration_fmt = format_minutes_seconds(float(dur_val))

            calories_fmt = ""
            if kcal_val is not None:
                calories_fmt = f"{int(round(float(kcal_val)))} kcal"

            if start_raw and end_raw:
                time_raw = f"{start_raw} - {end_raw}"
            else:
                time_raw = start_raw or ""

            entries_out.append({
                "start": start_raw or None,
                "end": end_raw or None,
                "time_raw": time_raw,
                "activity": activity_val,
                "duration": duration_fmt,
                "calories": calories_fmt,
            })
    except Exception:
        entries_out = []
    return entries_out


def _merge_training_entries(
    existing: list[TrainingEntry],
    new: list[TrainingEntry],
) -> list[TrainingEntry]:
    """
    Deduplicate training rows, letting new entries override prior ones.

    Args:
        existing: Previously cached/parsed entries
        new: New entries to merge in

    Returns:
        Merged list with duplicates removed (new wins over existing)
    """
    merged: OrderedDict[tuple, TrainingEntry] = OrderedDict()

    def key(entry: TrainingEntry) -> tuple:
        return (
            entry.get("start") or "",
            entry.get("end") or "",
            (entry.get("activity") or "").strip().lower(),
            entry.get("duration") or "",
            entry.get("calories") or "",
        )

    for e in existing:
        merged[key(e)] = e
    for e in new:
        merged[key(e)] = e
    return list(merged.values())


def _render_training_entries(entries: list[TrainingEntry]) -> list[str]:
    """
    Render training entries as markdown table lines.

    Args:
        entries: List of training entries to render

    Returns:
        List of markdown lines (header, separator, rows)
    """
    if not entries:
        return []

    def to_minutes(val: str) -> int | None:
        try:
            h, m = map(int, val.split(":"))
            return h * 60 + m
        except Exception:
            return None

    def sort_key(e: TrainingEntry) -> tuple:
        mins = to_minutes(e.get("start") or "")
        return (mins if mins is not None else 24 * 60 + 1, e.get("activity") or "")

    ordered = sorted(entries, key=sort_key)
    header = "| TIME | ACTIVITY | DURATION | CALORIES |"
    separator = "| ---- | -------- | -------- | -------- |"
    lines_out = [header, separator]
    for entry in ordered:
        if entry.get("start") and entry.get("end"):
            time_cell = f"`{entry['start']} - {entry['end']}`"
        elif entry.get("start"):
            time_cell = f"`{entry['start']}`"
        elif entry.get("time_raw"):
            time_cell = f"`{entry['time_raw']}`"
        else:
            time_cell = ""

        duration_cell = f"`{entry['duration']}`" if entry.get("duration") else ""
        calories_cell = f"`{entry['calories']}`" if entry.get("calories") else ""

        row = f"| {time_cell} | {entry.get('activity', '')} | {duration_cell} | {calories_cell} |"
        lines_out.append(row)
    return lines_out


def _build_training_section(
    workout_data: dict | list | None,
    stretch_data: dict | list | None,
    existing_block: list[str] | None,
    today_str: str,
) -> tuple[list[str], list[TrainingEntry]]:
    """
    Build training section lines from workout/stretch data.

    Args:
        workout_data: Raw workout JSON data
        stretch_data: Raw stretch JSON data
        existing_block: Lines from existing training block in note
        today_str: Today's date as YYYY-MM-DD string

    Returns:
        Tuple of (section_lines, merged_entries)
    """
    existing_entries = _parse_training_table(existing_block)
    workout_entries = _activity_entries_from_data(workout_data, "Workout")
    stretch_entries = _activity_entries_from_data(stretch_data, "Stretching")
    new_entries = workout_entries + stretch_entries

    cache_entries = _load_training_cache(today_str)

    merged: list[TrainingEntry] = []
    if new_entries:
        merged = _merge_training_entries(cache_entries, new_entries)
        _save_training_cache(today_str, merged)
    elif cache_entries:
        merged = cache_entries
    elif existing_block:
        merged = existing_entries

    lines_out = ["### **TRAINING**"]
    lines_out.append("")  # spacer between header and body
    if merged:
        lines_out.extend(_render_training_entries(merged))
    else:
        lines_out.append("_No training sessions completed today._")

    return lines_out, merged
