"""
Sleep table parsing for the journal sync system.
"""

from __future__ import annotations

import re

from sync.constants import SLEEP_SECTION_HEADER
from sync.contracts.sleep import SleepEntry
from sync.notes.markdown_tables import find_markdown_table
from .common import extract_block, parse_duration_to_minutes


_SLEEP_HEADER_CELLS = ("time", "asleep", "awake")
_TIME_RANGE_RE = re.compile(r"(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})")


def parse_sleep_table(lines: list[str]) -> list[SleepEntry]:
    """
    Parse the SLEEP table from daily note lines.

    Args:
        lines: All lines from a daily note

    Returns:
        List of SleepEntry dataclasses
    """
    block = extract_block(lines, SLEEP_SECTION_HEADER)
    if not block:
        return []

    table = find_markdown_table(
        block,
        header_matches=lambda cells: (
            tuple(cell.lower() for cell in cells[:3]) == _SLEEP_HEADER_CELLS
        ),
        lenient=True,
    )
    if table is None:
        return []

    entries: list[SleepEntry] = []
    for parts in table.rows:
        if len(parts) < 3:
            continue

        # Parse time range from TIME column
        asleep_time: str | None = None
        awake_time: str | None = None
        time_cell = parts[0].replace("`", "")
        time_match = _TIME_RANGE_RE.search(time_cell)
        if time_match:
            asleep_time = time_match.group(1)
            awake_time = time_match.group(2)

        duration_min = parse_duration_to_minutes(parts[1])
        awake_min = parse_duration_to_minutes(parts[2])

        entries.append(
            SleepEntry(
                duration_minutes=duration_min or 0.0,
                awake_minutes=awake_min,
                asleep_time=asleep_time,
                awake_time=awake_time,
            )
        )

    return entries
