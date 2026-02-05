"""
Screen time table parsing for the journal sync system.

Parses PROCRASTINATION table from daily notes to extract screen time data.
"""

from __future__ import annotations

import re

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
    block = extract_block(lines, "### **PROCRASTINATION**")
    if not block:
        return None

    # Find table header
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(r"\|\s*SOURCE\s*\|\s*DURATION\s*\|", line, re.IGNORECASE):
            header_idx = i
            break

    if header_idx == -1:
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
        if "no screen time" in source.lower():
            continue

        minutes = parse_duration_to_minutes(duration_raw, default=0.0) or 0.0
        if minutes > 0:
            entries.append(ScreenTimeEntry(app=source, minutes=minutes))

    if not entries:
        return None

    return DailyScreenTimeData(entries=entries)
