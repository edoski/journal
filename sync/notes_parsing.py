"""
Daily note parsing helpers for metrics extraction.
"""

from __future__ import annotations

import re

from sync.io import safe_read_file
from sync.readers.common import parse_duration_to_minutes as _parse_duration_to_minutes
from sync.readers.frontmatter import parse_frontmatter
from sync.readers.screen_time import parse_procrastination_table
from sync.notes_sections import extract_block


def _parse_bool(val) -> bool:
    """Parse a value as boolean."""
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def parse_study_table(lines: list[str]) -> list[tuple]:
    """Parse the STUDY table from daily note lines."""
    block = extract_block(lines, "### **STUDY**")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(
            r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(DURATION|FOCUS)\s*\|",
            line,
            re.IGNORECASE,
        ):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no study sessions", line, re.IGNORECASE):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 6:
            continue
        activity = parts[2].strip("`")
        duration_min = _parse_duration_to_minutes(parts[3])

        interrupt_min = 0
        if len(parts) > 4:
            interrupt_str = parts[4].strip("`").strip()
            interrupt_match = re.search(r"\+(\d+)m", interrupt_str)
            if interrupt_match:
                interrupt_min = int(interrupt_match.group(1))

        overrun_min = 0
        planned_break_min = 0
        if len(parts) > 5:
            break_str = parts[5].strip("`").strip()
            if break_str:
                planned_str = break_str.split("(", 1)[0].strip()
                planned_break_min = int(_parse_duration_to_minutes(planned_str) or 0)
            overrun_match = re.search(r"\(\+([^)]+)\)", break_str)
            if overrun_match:
                overrun_str = overrun_match.group(1)
                overrun_min = int(_parse_duration_to_minutes(overrun_str) or 0)

        if activity and duration_min:
            rows.append(
                (activity, duration_min, interrupt_min, overrun_min, planned_break_min)
            )
    return rows


def parse_sleep_table(lines: list[str]) -> list[tuple]:
    """Parse the SLEEP table from daily note lines."""
    block = extract_block(lines, "### **SLEEP**")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(
            r"\|\s*TIME\s*\|\s*DURATION\s*\|\s*AWAKE\s*\|\s*AWAKENINGS\s*\|",
            line,
            re.IGNORECASE,
        ):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        duration_min = _parse_duration_to_minutes(parts[2])
        awake_min = _parse_duration_to_minutes(parts[3])
        awakenings = None
        if parts[4]:
            try:
                awakenings = int(re.sub(r"[^0-9]", "", parts[4]))
            except (ValueError, TypeError):
                awakenings = None
        rows.append((duration_min, awake_min, awakenings))
    return rows


def parse_daily_note(path: str) -> dict | None:
    """Parse a daily note file and return extracted metrics."""
    lines = safe_read_file(path)
    if lines is None:
        return None

    fm = parse_frontmatter(lines)
    study_rows = parse_study_table(lines)
    sleep_rows = parse_sleep_table(lines)

    sleep_from_fm = _parse_duration_to_minutes(fm.get("sleep"))
    sleep_total = (
        sleep_from_fm
        if sleep_from_fm is not None
        else sum((r[0] or 0 for r in sleep_rows), 0)
    )

    mood_val = None
    if fm.get("mood") not in (None, ""):
        try:
            mood_str = fm.get("mood") or ""
            mood_val = float(re.sub(r"[^0-9.\-]", "", mood_str))
        except (ValueError, TypeError):
            mood_val = None

    workout = _parse_bool(fm.get("workout"))
    stretch = _parse_bool(fm.get("stretch"))
    meditate = _parse_bool(fm.get("meditate"))

    awake_total = sum((r[1] or 0 for r in sleep_rows), 0) if sleep_rows else None
    awakenings_total = None
    if sleep_rows:
        awak_counts = [r[2] for r in sleep_rows if r[2] is not None]
        if awak_counts:
            awakenings_total = sum(awak_counts)

    activity_totals: dict[str, float] = {}
    interrupt_total = 0
    overrun_total = 0
    planned_break_total = 0
    for row in study_rows:
        activity, minutes = row[0], row[1]
        activity_totals[activity] = activity_totals.get(activity, 0) + minutes
        if len(row) > 2:
            interrupt_total += row[2]
        if len(row) > 3:
            overrun_total += row[3]
        if len(row) > 4:
            planned_break_total += row[4]

    study_total = sum(activity_totals.values())

    screen_time_data = parse_procrastination_table(lines)
    screen_time_totals: dict[str, float] = {}
    if screen_time_data and screen_time_data.entries:
        for entry in screen_time_data.entries:
            screen_time_totals[entry.app] = (
                screen_time_totals.get(entry.app, 0) + entry.minutes
            )

    return {
        "study_minutes": study_total,
        "sleep_minutes": sleep_total,
        "mood": mood_val,
        "workout": workout,
        "stretch": stretch,
        "meditate": meditate,
        "awake_minutes": awake_total,
        "awakenings": awakenings_total,
        "activity_totals": activity_totals,
        "interrupt_minutes": interrupt_total,
        "overrun_minutes": overrun_total,
        "planned_break_minutes": planned_break_total,
        "screen_time_totals": screen_time_totals,
    }
