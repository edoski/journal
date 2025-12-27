"""
Study section building for daily sync.

Provides functions to extract existing notes from study tables and build
the updated study section for daily notes.
"""
from __future__ import annotations

import re
from typing import Any

from sync_utils import format_minutes, ceil_minutes, round_half_up


# Type alias for session dictionaries
SessionDict = dict[str, Any]


def _extract_existing_notes(lines: list[str]) -> dict[str, str]:
    """
    Extract notes from existing study table keyed by start time (HH:MM).

    Args:
        lines: Lines from the daily note

    Returns:
        Dict mapping start times (e.g., "09:00") to note content
    """
    existing_notes: dict[str, str] = {}
    table_header_re = re.compile(
        r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(FOCUS|DURATION)\s*\|\s*(PAUSE|INTERRUPT)\s*\|\s*BREAK\s*\|\s*NOTES\s*\|",
        re.IGNORECASE
    )
    header_idx = -1
    for i, line in enumerate(lines):
        if table_header_re.match(line.strip()):
            header_idx = i
            break
    if header_idx == -1:
        return existing_notes

    row_start = header_idx + 2  # skip header and separator
    for i in range(row_start, len(lines)):
        if not lines[i].lstrip().startswith("|"):
            break
        parts = [p.strip() for p in lines[i].split("|")]
        if len(parts) < 7:
            continue
        time_cell = parts[1].replace("`", "")
        time_match = re.search(r"([0-2][0-9]:[0-5][0-9])", time_cell)
        if not time_match:
            continue
        start_key = time_match.group(1)
        note_content = parts[6]
        if note_content and note_content != "❌":
            existing_notes[start_key] = note_content
    return existing_notes


def _build_study_section(
    sessions: list[SessionDict],
    existing_notes: dict[str, str],
) -> tuple[list[str], int]:
    """
    Build the study table lines and compute focus_minutes on each session.

    Args:
        sessions: List of enriched session dictionaries
        existing_notes: Dict of existing notes keyed by start time

    Returns:
        Tuple of (table_lines, total_focus_minutes)
    """
    if not sessions:
        return [], 0

    header = "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | NOTES |"
    separator = "| ---- | -------- | -------- | --------- | ----- | ----- |"
    table_lines = [header, separator]

    for session in sessions:
        start_s = session['start'].strftime("%H:%M")
        end_s = session['end'].strftime("%H:%M")
        time_str = f"`{start_s} - {end_s}`"

        title = session['title']
        if title and title.lower() != "flow":
            activity_str = title
        else:
            activity_str = "Flow"

        actual_minutes = session.get('actual_elapsed', 0) or 0
        interrupt_minutes = (session.get('interruptions_duration', 0) or 0) / 60.0

        interrupt_rounded = round_half_up(interrupt_minutes)
        focus_rounded = max(0, round_half_up(actual_minutes - interrupt_minutes))

        session['focus_minutes'] = focus_rounded
        session['focus_minutes_rounded'] = focus_rounded

        duration_str = f"`{format_minutes(focus_rounded)}`"
        interrupt_str = f"`+{interrupt_rounded:02d}m`" if interrupt_rounded > 0 else "`+00m`"

        break_str = ""
        break_expected_val = session.get('break_expected', session.get('break_duration', 0)) or 0
        break_min = ceil_minutes(break_expected_val)
        overrun = int(session.get('break_overrun', 0))
        break_reason = session.get('break_reason')
        if break_min > 0:
            break_display = f"{break_min}m" if break_reason == "lunch" else format_minutes(break_min)
            parts = []
            if break_reason and break_reason != "lunch":
                parts.append(break_reason)
            if session.get('break_missing', False):
                parts.append("missing")
            if overrun > 0:
                parts.append(f"+{format_minutes(overrun)}")

            if parts:
                break_str = f"`{break_display} ({', '.join(parts)})`"
            else:
                break_str = f"`{break_display}`"

        notes_str = existing_notes.get(start_s, "")
        row = f"| {time_str} | {activity_str} | {duration_str} | {interrupt_str} | {break_str} | {notes_str} |"
        table_lines.append(row)

    total_focus = sum(s.get('focus_minutes_rounded', 0) for s in sessions)
    return table_lines, total_focus
