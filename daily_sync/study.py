"""
Study section building for daily sync.

Provides functions to extract existing notes from study tables and build
the updated study section for daily notes.
"""
from __future__ import annotations

import re
from typing import Any

from sync_utils import format_minutes, ceil_minutes, round_half_up

from typing import Callable


# Type alias for session dictionaries
SessionDict = dict[str, Any]


def _extract_existing_data(lines: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    """
    Extract notes and context from existing study table keyed by start time (HH:MM).

    Args:
        lines: Lines from the daily note

    Returns:
        Tuple of (notes_dict, context_dict) mapping start times to content
    """
    existing_notes: dict[str, str] = {}
    existing_context: dict[str, str] = {}
    table_header_re = re.compile(
        r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(FOCUS|DURATION)\s*\|\s*(PAUSE|INTERRUPT)\s*\|\s*BREAK\s*\|(\s*CONTEXT\s*\|)?\s*NOTES\s*\|",
        re.IGNORECASE
    )
    header_idx = -1
    for i, line in enumerate(lines):
        if table_header_re.match(line.strip()):
            header_idx = i
            break
    if header_idx == -1:
        return existing_notes, existing_context

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
        # Handle both old format (no CONTEXT) and new format (with CONTEXT)
        if len(parts) >= 8:  # New format with CONTEXT
            context_content = parts[6]
            note_content = parts[7]
            # Preserve context if it's not an em-dash (has actual content)
            if context_content and context_content != "–":
                existing_context[start_key] = context_content
        else:  # Old format without CONTEXT
            note_content = parts[6]
        if note_content and note_content != "❌":
            existing_notes[start_key] = note_content
    return existing_notes, existing_context


# Backward compatibility alias
def _extract_existing_notes(lines: list[str]) -> dict[str, str]:
    """Extract notes only (backward compatibility)."""
    notes, _ = _extract_existing_data(lines)
    return notes


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


def _build_study_section(
    sessions: list[SessionDict],
    existing_notes: dict[str, str],
    context_for_session: Callable[[Any, Any], str] | None = None,
    existing_context: dict[str, str] | None = None,
) -> tuple[list[str], int]:
    """
    Build the study table lines and compute focus_minutes on each session.

    Args:
        sessions: List of enriched session dictionaries
        existing_notes: Dict of existing notes keyed by start time
        context_for_session: Optional callback(session_start, session_end) -> context string
        existing_context: Dict of existing context keyed by start time (preserved)

    Returns:
        Tuple of (table_lines, total_focus_minutes)
    """
    if existing_context is None:
        existing_context = {}
    if not sessions:
        return [], 0

    header = "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |"
    separator = "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |"
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
        interrupt_str = _format_interrupt(interrupt_rounded)

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

        notes_str = existing_notes.get(start_s) or "–"
        
        # Preserve existing context, only compute for new sessions
        if start_s in existing_context:
            context_str = existing_context[start_s]
        elif context_for_session:
            context_str = context_for_session(session['start'], session['end'])
        else:
            context_str = "–"  # em-dash when no callback
        
        row = f"| {time_str} | {activity_str} | {duration_str} | {interrupt_str} | {break_str} | {context_str} | {notes_str} |"
        table_lines.append(row)

    total_focus = sum(s.get('focus_minutes_rounded', 0) for s in sessions)
    return table_lines, total_focus
