"""
Screen time table parsing for the journal sync system.

Parses PROCRASTINATION table from daily notes to extract screen time data.
"""

from __future__ import annotations

import re

from sync.constants import (
    NO_SCREEN_TIME_TOKEN,
    PROCRASTINATION_SECTION_HEADER,
    PROCRASTINATION_TABLE_HEADER_RE,
)
from sync.models.screen_time import ScreenTimeEntry, DailyScreenTimeData
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

    # Find table header
    header_idx = next(
        (
            i
            for i, line in enumerate(block)
            if re.search(PROCRASTINATION_TABLE_HEADER_RE, line, re.IGNORECASE)
        ),
        None,
    )

    if header_idx is None:
        return None

    entries: list[ScreenTimeEntry] = []
    for line in block[header_idx + 2 :]:  # Skip header and separator
        if not line.strip().startswith("|"):
            break

        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            continue

        source = parts[1].strip().strip("*")  # Handle **TOTAL**
        duration_raw = parts[2].strip()

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
