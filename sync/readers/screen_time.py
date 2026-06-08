"""
Screen time table parsing for the journal sync system.

Parses PROCRASTINATION table from daily notes to extract screen time data.
"""

from __future__ import annotations

from sync.constants import (
    NO_SCREEN_TIME_TOKEN,
    PROCRASTINATION_SECTION_HEADER,
)
from sync.contracts.screen_time import ScreenTimeEntry, DailyScreenTimeData
from sync.formatting import normalize_screen_time_label
from sync.notes.markdown_tables import find_markdown_table
from .common import extract_block, parse_duration_to_minutes


def parse_procrastination_table(lines: list[str]) -> DailyScreenTimeData | None:
    """
    Parse the PROCRASTINATION table from daily note lines.

    Args:
        lines: All lines from a daily note

    Returns:
        DailyScreenTimeData or None if no PROCRASTINATION section
    """
    block = extract_block(lines, PROCRASTINATION_SECTION_HEADER)
    if not block:
        return None

    table = find_markdown_table(
        block,
        header_matches=lambda cells: (
            len(cells) >= 2
            and cells[0].strip().lower() == "source"
            and cells[1].strip().lower() == "duration"
        ),
        lenient=True,
    )
    if table is None:
        return None

    entries: list[ScreenTimeEntry] = []
    for parts in table.rows:
        if len(parts) < 2:
            continue

        source = normalize_screen_time_label(parts[0].strip().strip("*"))
        duration_raw = parts[1].strip()

        # Skip TOTAL row and empty rows
        if source.upper() == "TOTAL" or not source:
            continue

        # Skip "no screen time" message rows
        source_lower = source.lower()
        if NO_SCREEN_TIME_TOKEN in source_lower:
            continue

        minutes = parse_duration_to_minutes(duration_raw) or 0.0
        if minutes > 0:
            entries.append(ScreenTimeEntry(app=source, minutes=minutes))

    if not entries:
        return None

    return DailyScreenTimeData(entries=entries)
