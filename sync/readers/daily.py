"""
Daily note reader for aggregate metric dictionaries.
"""

from __future__ import annotations

import re
from collections import defaultdict

from sync.constants import (
    NO_TRAINING_SESSIONS_TOKEN,
    TRAINING_SECTION_HEADER,
)
from sync.contracts.metrics import DailyAggregate, TrainingOccurrence
from sync.notes.markdown_tables import find_markdown_table
from sync.readers.common import extract_block, parse_duration_to_minutes
from sync.readers.frontmatter import parse_frontmatter
from sync.readers.sleep import parse_sleep_table
from sync.readers.study import parse_study_table

_TRAINING_TIME_RE = re.compile(r"\d{2}:\d{2}")
_TRAINING_TIME_RANGE_RE = re.compile(r"^(?P<start>\d{2}:\d{2}) - (?P<end>\d{2}:\d{2})$")


def _parse_bool(val: object) -> bool:
    """Parse a value as boolean."""
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def _parse_hhmm_to_minutes(value: str) -> int | None:
    """Parse canonical HH:MM into minutes since midnight."""
    if _TRAINING_TIME_RE.fullmatch(value) is None:
        return None
    hour, minute = map(int, value.split(":"))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _parse_training_time_range(raw: str, *, line_no: int) -> tuple[int, int]:
    """
    Parse strict training time range `HH:MM - HH:MM`.

    Raises ValueError when format is invalid because training aggregation
    requires canonical schedule times for every counted session.
    """
    cleaned = raw.strip().strip("`")
    match = _TRAINING_TIME_RANGE_RE.fullmatch(cleaned)
    if match is None:
        raise ValueError(
            "Non-canonical TRAINING TIME value on row "
            f"{line_no}: expected `HH:MM - HH:MM`, got {raw!r}"
        )
    start_raw = match.group("start")
    end_raw = match.group("end")
    start_minutes = _parse_hhmm_to_minutes(start_raw)
    end_minutes = _parse_hhmm_to_minutes(end_raw)
    if start_minutes is None or end_minutes is None:
        raise ValueError(
            "Invalid TRAINING TIME value on row "
            f"{line_no}: expected valid 24h times, got {raw!r}"
        )
    return start_minutes, end_minutes


def _parse_training_table_rows(
    lines: list[str],
) -> list[TrainingOccurrence]:
    """Parse the TRAINING table into session rows."""
    block = extract_block(lines, TRAINING_SECTION_HEADER)
    if not block:
        return []

    table = find_markdown_table(
        block,
        header_matches=lambda cells: (
            len(cells) >= 4
            and cells[0].strip().lower() == "time"
            and cells[1].strip().lower() == "activity"
            and cells[2].strip().lower() == "duration"
            and cells[3].strip().lower() == "interrupt"
        ),
        lenient=True,
    )
    if table is None:
        return []

    rows: list[TrainingOccurrence] = []
    for row_no, parts in enumerate(table.rows, start=table.start_idx + 3):
        if NO_TRAINING_SESSIONS_TOKEN in " | ".join(parts).lower():
            continue

        if len(parts) < 4:
            continue

        activity = parts[1].strip().strip("`")
        duration_min = parse_duration_to_minutes(parts[2]) or 0.0
        if activity and duration_min > 0:
            start_minutes, end_minutes = _parse_training_time_range(
                parts[0], line_no=row_no
            )
            interrupt_min = parse_duration_to_minutes(parts[3]) or 0.0
            rows.append(
                TrainingOccurrence(
                    activity=activity,
                    duration_minutes=duration_min,
                    interrupt_minutes=interrupt_min,
                    start_minutes=start_minutes,
                    end_minutes=end_minutes,
                )
            )

    return rows


def parse_daily_note(lines: list[str]) -> DailyAggregate:
    """Parse daily-note lines into aggregate metrics."""
    fm = parse_frontmatter(lines)
    study_rows = parse_study_table(lines)
    sleep_rows = parse_sleep_table(lines)
    training_rows = _parse_training_table_rows(lines)

    sleep_from_fm = parse_duration_to_minutes(fm.get("sleep"))
    sleep_total = (
        sleep_from_fm
        if sleep_from_fm is not None
        else sum(entry.duration_minutes or 0 for entry in sleep_rows)
    )

    workout = _parse_bool(fm.get("workout"))
    stretch = _parse_bool(fm.get("stretch"))

    awake_total = (
        sum(entry.awake_minutes or 0 for entry in sleep_rows) if sleep_rows else None
    )
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

    return {
        "study_minutes": study_total,
        "sleep_minutes": sleep_total,
        "workout": workout,
        "stretch": stretch,
        "awake_minutes": awake_total,
        "sleep_asleep_time": sleep_asleep_time,
        "sleep_awake_time": sleep_awake_time,
        "activity_totals": dict(activity_totals),
        "interrupt_minutes": interrupt_total,
        "overrun_minutes": overrun_total,
        "planned_break_minutes": planned_break_total,
        "training_occurrences": tuple(training_rows),
    }
