"""
Sleep table parsing for the journal sync system.
"""

from __future__ import annotations

import re

from sync.constants import SLEEP_SECTION_HEADER
from sync.models import SleepEntry
from sync.notes.markdown_tables import split_markdown_row
from .common import extract_block, parse_duration_to_minutes


_SLEEP_HEADER_CELLS = ("time", "duration", "awake", "awakenings")


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

    header_idx: int | None = None
    for i, line in enumerate(block):
        cells = split_markdown_row(line)
        if (
            cells is not None
            and tuple(cell.lower() for cell in cells) == _SLEEP_HEADER_CELLS
        ):
            header_idx = i
            break

    if header_idx is None:
        return []

    entries: list[SleepEntry] = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break

        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue

        duration_min = parse_duration_to_minutes(parts[2])
        awake_min = parse_duration_to_minutes(parts[3])

        awakenings: int | None = None
        if parts[4]:
            try:
                awakenings = int(re.sub(r"[^0-9]", "", parts[4]))
            except ValueError:
                awakenings = None

        entries.append(
            SleepEntry(
                duration_minutes=duration_min or 0.0,
                awake_minutes=awake_min,
                awakenings=awakenings,
            )
        )

    return entries
