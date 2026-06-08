"""
Study section building for daily sync.

Provides functions to build the updated study section for daily notes.
"""

from __future__ import annotations

from sync.contracts.study import StudySessionRecord
from sync.formatting import format_minutes, ceil_minutes, round_half_up
from sync.writers.tables import SimpleGridTableSpec, render_table

from sync.study.labels import DEFAULT_ACTIVITY_LABEL, FLOW_DEFAULT_TITLE


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

    for session in sessions:
        start_s = session["start"].strftime("%H:%M")
        end_s = session["end"].strftime("%H:%M")
        time_str = f"`{start_s} - {end_s}`"

        title = (session.get("title") or "").strip()
        if title and title.casefold() != FLOW_DEFAULT_TITLE:
            activity_str = title
        else:
            activity_str = DEFAULT_ACTIVITY_LABEL

        actual_minutes = session.get("actual_elapsed", 0) or 0
        interrupt_minutes = (session.get("interruptions_duration", 0) or 0) / 60.0

        interrupt_rounded = round_half_up(interrupt_minutes)
        focus_rounded = max(0, round_half_up(actual_minutes - interrupt_minutes))

        session["focus_minutes"] = focus_rounded
        session["focus_minutes_rounded"] = focus_rounded

        duration_str = f"`{format_minutes(focus_rounded)}`"
        interrupt_str = _format_interrupt(interrupt_rounded)

        break_str = ""
        break_expected_val = (
            session.get("break_expected", session.get("break_duration", 0)) or 0
        )
        has_break_value = "break_expected" in session or "break_duration" in session
        break_min = ceil_minutes(break_expected_val)
        overrun = int(session.get("break_overrun", 0))
        break_reason = session.get("break_reason")
        break_missing = bool(session.get("break_missing", False))
        if break_min > 0 or (has_break_value and (not break_missing or break_min == 0)):
            break_display = (
                f"{break_min}m"
                if break_reason == "lunch"
                else format_minutes(break_min)
            )
            parts = []
            if break_reason and break_reason != "lunch":
                parts.append(break_reason)
            if overrun > 0:
                parts.append(f"+{format_minutes(overrun)}")

            if parts:
                break_str = f"`{break_display} ({', '.join(parts)})`"
            else:
                break_str = f"`{break_display}`"

        rows.append(
            [
                time_str,
                activity_str,
                duration_str,
                interrupt_str,
                break_str,
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
