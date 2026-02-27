"""
Daily note reader for aggregate metric dictionaries.
"""

from __future__ import annotations

import re
from collections import defaultdict

from sync.constants import (
    NO_TRAINING_SESSIONS_TOKEN,
    TRAINING_SECTION_HEADER,
    TRAINING_TABLE_HEADER_RE,
)
from sync.contracts.metrics import DailyAggregate
from sync.io import safe_read_file
from sync.notes.markdown_tables import split_markdown_row
from sync.readers.common import extract_block, parse_duration_to_minutes
from sync.readers.frontmatter import parse_frontmatter
from sync.readers.screen_time import parse_procrastination_table
from sync.readers.sleep import parse_sleep_table
from sync.readers.study import parse_study_table


def _split_row(line: str) -> list[str] | None:
    row = split_markdown_row(line)
    if row is not None:
        return row
    stripped = line.strip()
    if stripped.startswith("|") and not stripped.endswith("|"):
        return split_markdown_row(f"{stripped}|")
    return None


def _parse_bool(val: object) -> bool:
    """Parse a value as boolean."""
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def _parse_optional_mood(value: object) -> float | None:
    """Parse a frontmatter mood value into a float when possible."""
    if value is None:
        return None
    mood_clean = re.sub(r"[^0-9.\-]", "", str(value))
    if not mood_clean:
        return None
    if re.fullmatch(r"-?\d+(?:\.\d+)?", mood_clean) is None:
        return None
    return float(mood_clean)


def _parse_training_table_rows(lines: list[str]) -> list[tuple[str, float]]:
    """Parse the TRAINING table into (activity, duration_minutes) rows."""
    block = extract_block(lines, TRAINING_SECTION_HEADER)
    if not block:
        return []

    header_idx = next(
        (
            i
            for i, line in enumerate(block)
            if re.search(TRAINING_TABLE_HEADER_RE, line, re.IGNORECASE)
        ),
        None,
    )
    if header_idx is None:
        return []

    rows: list[tuple[str, float]] = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        line_lower = line.lower()
        if NO_TRAINING_SESSIONS_TOKEN in line_lower:
            continue

        parts = _split_row(line)
        if parts is None or len(parts) < 3:
            continue

        activity = parts[1].strip().strip("`")
        duration_min = parse_duration_to_minutes(parts[2]) or 0.0
        if activity and duration_min > 0:
            rows.append((activity, duration_min))

    return rows


def parse_daily_note(path: str) -> DailyAggregate | None:
    """Parse a daily note file and return extracted aggregate metrics."""
    lines = safe_read_file(path)
    if lines is None:
        return None

    fm = parse_frontmatter(lines)
    try:
        study_rows = parse_study_table(lines)
    except ValueError as exc:
        raise ValueError(f"Invalid daily note schema in {path}: {exc}") from exc
    sleep_rows = parse_sleep_table(lines)
    training_rows = _parse_training_table_rows(lines)

    sleep_from_fm = parse_duration_to_minutes(fm.get("sleep"))
    sleep_total = (
        sleep_from_fm
        if sleep_from_fm is not None
        else sum(entry.duration_minutes or 0 for entry in sleep_rows)
    )

    mood_val = _parse_optional_mood(fm.get("mood"))

    workout = _parse_bool(fm.get("workout"))
    stretch = _parse_bool(fm.get("stretch"))
    meditate = _parse_bool(fm.get("meditate"))

    awake_total = (
        sum(entry.awake_minutes or 0 for entry in sleep_rows) if sleep_rows else None
    )
    awakenings_total = None
    if sleep_rows:
        awak_counts = [
            entry.awakenings for entry in sleep_rows if entry.awakenings is not None
        ]
        if awak_counts:
            awakenings_total = sum(awak_counts)

    # Extract sleep schedule times from first entry (one sleep session per day)
    sleep_asleep_time = sleep_rows[0].asleep_time if sleep_rows else None
    sleep_awake_time = sleep_rows[0].awake_time if sleep_rows else None

    activity_totals = defaultdict[str, float](float)
    interrupt_total = 0.0
    overrun_total = 0.0
    planned_break_total = 0.0
    for session in study_rows:
        activity_totals[session.activity] += session.duration_minutes
        interrupt_total += session.interrupt_minutes
        overrun_total += session.overrun_minutes
        planned_break_total += session.break_minutes

    study_total = sum(activity_totals.values())

    training_type_minutes = defaultdict[str, float](float)
    training_type_sessions = defaultdict[str, int](int)
    for activity, minutes in training_rows:
        training_type_minutes[activity] += minutes
        training_type_sessions[activity] += 1

    screen_time_data = parse_procrastination_table(lines)
    screen_time_totals = defaultdict[str, float](float)
    if screen_time_data and screen_time_data.entries:
        for entry in screen_time_data.entries:
            screen_time_totals[entry.app] += entry.minutes

    return {
        "study_minutes": study_total,
        "sleep_minutes": sleep_total,
        "mood": mood_val,
        "workout": workout,
        "stretch": stretch,
        "meditate": meditate,
        "awake_minutes": awake_total,
        "awakenings": awakenings_total,
        "sleep_asleep_time": sleep_asleep_time,
        "sleep_awake_time": sleep_awake_time,
        "activity_totals": dict(activity_totals),
        "interrupt_minutes": interrupt_total,
        "overrun_minutes": overrun_total,
        "planned_break_minutes": planned_break_total,
        "training_type_minutes": dict(training_type_minutes),
        "training_type_sessions": dict(training_type_sessions),
        "screen_time_totals": dict(screen_time_totals),
    }
