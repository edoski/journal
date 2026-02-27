"""
Sleep table parsing for the journal sync system.
"""

from __future__ import annotations

import re

from sync.constants import SLEEP_SECTION_HEADER
from sync.contracts.sleep import SleepEntry
from sync.notes.markdown_tables import split_markdown_row
from .common import extract_block, parse_duration_to_minutes


_SLEEP_HEADER_CELLS = ("time", "duration", "awake", "awakenings")
_TIME_RANGE_RE = re.compile(r"(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})")


def _split_row(line: str) -> list[str] | None:
    row = split_markdown_row(line)
    if row is not None:
        return row
    stripped = line.strip()
    if stripped.startswith("|") and not stripped.endswith("|"):
        return split_markdown_row(f"{stripped}|")
    return None


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
        cells = _split_row(line)
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

        parts = _split_row(line)
        if parts is None or len(parts) < 4:
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

        awakenings: int | None = None
        if parts[3]:
            try:
                awakenings = int(re.sub(r"[^0-9]", "", parts[3]))
            except ValueError:
                awakenings = None

        entries.append(
            SleepEntry(
                duration_minutes=duration_min or 0.0,
                awake_minutes=awake_min,
                awakenings=awakenings,
                asleep_time=asleep_time,
                awake_time=awake_time,
            )
        )

    return entries
