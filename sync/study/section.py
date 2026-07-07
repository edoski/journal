"""
Study section building for daily sync.

Provides functions to build the updated study section for daily notes.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.contracts.study import StudySessionRecord
from sync.formatting import format_minutes, ceil_minutes, round_half_up
from sync.writers.tables import SimpleGridTableSpec, render_table

from sync.study.labels import DEFAULT_ACTIVITY_LABEL, FLOW_DEFAULT_TITLE

_TABLE_MERGE_MAX_GAP_SECONDS = 120


@dataclass(frozen=True)
class _StudyDisplayRow:
    start: datetime.datetime
    end: datetime.datetime
    activity: str
    focus_minutes: int
    interrupt_minutes: int
    break_text: str


def _format_interrupt(minutes: int) -> str:
    """
    Format interrupt duration for display.

    Uses XhYYm format for durations >= 60 minutes, +XXm otherwise.

    Args:
        minutes: Interrupt duration in minutes

    Returns:
        Formatted string like `+23m` or `+4h56m`
    """
    if minutes >= 60:
        hours = minutes // 60
        mins = minutes % 60
        return f"`+{hours}h{mins:02d}m`"
    return f"`+{minutes:02d}m`"


def _activity_label(session: StudySessionRecord) -> str:
    title = (session.get("title") or "").strip()
    if title and title.casefold() != FLOW_DEFAULT_TITLE:
        return title
    return DEFAULT_ACTIVITY_LABEL


def _format_break(session: StudySessionRecord) -> str:
    break_expected_val = (
        session.get("break_expected", session.get("break_duration", 0)) or 0
    )
    has_break_value = "break_expected" in session or "break_duration" in session
    break_min = ceil_minutes(break_expected_val)
    overrun = int(session.get("break_overrun", 0))
    break_reason = session.get("break_reason")
    break_missing = bool(session.get("break_missing", False))
    if break_min <= 0 and (not has_break_value or (break_missing and break_min != 0)):
        return ""

    break_display = (
        f"{break_min}m" if break_reason == "lunch" else format_minutes(break_min)
    )
    parts: list[str] = []
    if break_reason and break_reason != "lunch":
        parts.append(break_reason)
    if overrun > 0:
        parts.append(f"+{format_minutes(overrun)}")

    if parts:
        return f"`{break_display} ({', '.join(parts)})`"
    return f"`{break_display}`"


def _session_display_row(session: StudySessionRecord) -> _StudyDisplayRow:
    actual_minutes = session.get("actual_elapsed", 0) or 0
    interrupt_minutes = (session.get("interruptions_duration", 0) or 0) / 60.0

    interrupt_rounded = round_half_up(interrupt_minutes)
    focus_rounded = max(0, round_half_up(actual_minutes - interrupt_minutes))

    session["focus_minutes"] = focus_rounded
    session["focus_minutes_rounded"] = focus_rounded

    return _StudyDisplayRow(
        start=session["start"],
        end=session["end"],
        activity=_activity_label(session),
        focus_minutes=focus_rounded,
        interrupt_minutes=interrupt_rounded,
        break_text=_format_break(session),
    )


def _can_merge_display_rows(
    previous: _StudyDisplayRow,
    current: _StudyDisplayRow,
) -> bool:
    gap_seconds = (current.start - previous.end).total_seconds()
    return (
        previous.activity == current.activity
        and gap_seconds >= 0
        and gap_seconds <= _TABLE_MERGE_MAX_GAP_SECONDS
    )


def _merge_display_rows(rows: list[_StudyDisplayRow]) -> list[_StudyDisplayRow]:
    merged: list[_StudyDisplayRow] = []
    for row in rows:
        if not merged:
            merged.append(row)
            continue

        previous = merged[-1]
        if not _can_merge_display_rows(previous, row):
            merged.append(row)
            continue

        merged[-1] = _StudyDisplayRow(
            start=previous.start,
            end=row.end,
            activity=previous.activity,
            focus_minutes=previous.focus_minutes + row.focus_minutes,
            interrupt_minutes=previous.interrupt_minutes + row.interrupt_minutes,
            break_text=row.break_text,
        )
    return merged


def build_study_section(
    sessions: list[StudySessionRecord],
) -> tuple[list[str], int]:
    """
    Build the study table lines and compute focus_minutes on each session.

    Args:
        sessions: List of enriched session dictionaries

    Returns:
        Tuple of (table_lines, total_focus_minutes)
    """
    if not sessions:
        return [], 0

    rows: list[list[str]] = []
    display_rows = _merge_display_rows(
        [_session_display_row(session) for session in sessions]
    )

    for row in display_rows:
        start_s = row.start.strftime("%H:%M")
        end_s = row.end.strftime("%H:%M")
        time_str = f"`{start_s} - {end_s}`"

        rows.append(
            [
                time_str,
                row.activity,
                f"`{format_minutes(row.focus_minutes)}`",
                _format_interrupt(row.interrupt_minutes),
                row.break_text,
            ]
        )

    total_focus = sum(s.get("focus_minutes_rounded", 0) for s in sessions)
    table_lines = render_table(
        SimpleGridTableSpec(
            headers=[
                "TIME",
                "ACTIVITY",
                "DURATION",
                "INTERRUPT",
                "BREAK",
            ],
            divider_cells=[
                "----",
                "--------",
                "--------",
                "---------",
                "-----",
            ],
            rows=rows,
        )
    )
    return table_lines, total_focus
