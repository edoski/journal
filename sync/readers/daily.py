"""
Daily note reader for aggregate metric dictionaries.
"""

from __future__ import annotations

import re

from sync.contracts.metrics import DailyAggregate
from sync.io import safe_read_file
from sync.readers.common import extract_block, parse_duration_to_minutes
from sync.readers.frontmatter import parse_frontmatter
from sync.readers.screen_time import parse_procrastination_table
from sync.readers.sleep import parse_sleep_table
from sync.readers.study import parse_study_table


def _parse_bool(val) -> bool:
    """Parse a value as boolean."""
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def _parse_training_table_rows(lines: list[str]) -> list[tuple[str, float]]:
    """Parse the TRAINING table into (activity, duration_minutes) rows."""
    block = extract_block(lines, "### **TRAINING**")
    if not block:
        return []

    header_idx = -1
    for i, line in enumerate(block):
        if re.search(
            r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*DURATION\s*\|",
            line,
            re.IGNORECASE,
        ):
            header_idx = i
            break
    if header_idx == -1:
        return []

    rows: list[tuple[str, float]] = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no training sessions", line, re.IGNORECASE):
            continue

        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue

        activity = parts[2].strip("`").strip()
        duration_min = parse_duration_to_minutes(parts[3], default=0.0) or 0.0
        if activity and duration_min > 0:
            rows.append((activity, duration_min))

    return rows


def parse_daily_note(path: str) -> DailyAggregate | None:
    """Parse a daily note file and return extracted aggregate metrics."""
    lines = safe_read_file(path)
    if lines is None:
        return None

    fm = parse_frontmatter(lines)
    study_rows = parse_study_table(lines)
    sleep_rows = parse_sleep_table(lines)
    training_rows = _parse_training_table_rows(lines)

    sleep_from_fm = parse_duration_to_minutes(fm.get("sleep"))
    sleep_total = (
        sleep_from_fm
        if sleep_from_fm is not None
        else sum((entry.duration_minutes or 0 for entry in sleep_rows), 0)
    )

    mood_val = None
    if fm.get("mood") not in (None, ""):
        try:
            mood_str = fm.get("mood") or ""
            mood_val = float(re.sub(r"[^0-9.\-]", "", mood_str))
        except (TypeError, ValueError):
            mood_val = None

    workout = _parse_bool(fm.get("workout"))
    stretch = _parse_bool(fm.get("stretch"))
    meditate = _parse_bool(fm.get("meditate"))

    awake_total = (
        sum((entry.awake_minutes or 0 for entry in sleep_rows), 0)
        if sleep_rows
        else None
    )
    awakenings_total = None
    if sleep_rows:
        awak_counts = [
            entry.awakenings for entry in sleep_rows if entry.awakenings is not None
        ]
        if awak_counts:
            awakenings_total = sum(awak_counts)

    activity_totals: dict[str, float] = {}
    interrupt_total = 0.0
    overrun_total = 0.0
    planned_break_total = 0.0
    for session in study_rows:
        activity_totals[session.activity] = (
            activity_totals.get(session.activity, 0) + session.duration_minutes
        )
        interrupt_total += session.interrupt_minutes
        overrun_total += session.overrun_minutes
        planned_break_total += session.break_minutes

    study_total = sum(activity_totals.values())

    training_type_minutes: dict[str, float] = {}
    training_type_sessions: dict[str, int] = {}
    for activity, minutes in training_rows:
        training_type_minutes[activity] = (
            training_type_minutes.get(activity, 0) + minutes
        )
        training_type_sessions[activity] = training_type_sessions.get(activity, 0) + 1

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
        "training_type_minutes": training_type_minutes,
        "training_type_sessions": training_type_sessions,
        "screen_time_totals": screen_time_totals,
    }
