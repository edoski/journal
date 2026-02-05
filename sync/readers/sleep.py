"""
Sleep table parsing for the journal sync system.
"""

from __future__ import annotations

import re

from sync.models import SleepEntry
from .common import extract_block, parse_duration_to_minutes


def parse_sleep_table(lines: list[str]) -> list[SleepEntry]:
    """
    Parse the SLEEP table from daily note lines.

    Args:
        lines: All lines from a daily note

    Returns:
        List of SleepEntry dataclasses
    """
    block = extract_block(lines, "### **SLEEP**")
    if not block:
        return []

    header_idx = -1
    for i, line in enumerate(block):
        if re.search(
            r"\|\s*TIME\s*\|\s*DURATION\s*\|\s*AWAKE\s*\|\s*AWAKENINGS\s*\|",
            line,
            re.IGNORECASE,
        ):
            header_idx = i
            break

    if header_idx == -1:
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
