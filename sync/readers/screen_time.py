"""
Screen time table parsing for the journal sync system.

Parses PROCRASTINATION table from daily notes to extract screen time data.
"""

from __future__ import annotations

import re

from sync.models.screen_time import ScreenTimeEntry, DailyScreenTimeData


def _normalize_header(line: str) -> str:
    """Normalize markdown headers for matching, ignoring emphasis markers."""
    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def _extract_block(lines: list[str], header: str) -> list[str] | None:
    """Extract lines belonging to a markdown header section."""
    header_norm = _normalize_header(header)
    start = -1
    for idx, line in enumerate(lines):
        if _normalize_header(line) == header_norm:
            start = idx
            break
    if start == -1:
        return None
    level = len(header.split()[0]) if header.startswith("#") else 3
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if (
            stripped.startswith("#" * level + " ")
            and _normalize_header(stripped) != header_norm
        ):
            end = idx
            break
    return lines[start:end]


def _parse_duration_to_minutes(val: str) -> float:
    """
    Parse duration string like '1h15m', '20m', '+45m' to minutes.

    Handles backticks, plus signs, and various formats.
    """
    if not val:
        return 0.0

    # Strip backticks, plus signs, asterisks (bold markers)
    s = val.strip().strip("`").strip("+").strip("*").strip("`")
    if not s:
        return 0.0

    total = 0.0
    # Match hours
    match_h = re.search(r"(\d+(?:\.\d+)?)h", s, re.IGNORECASE)
    if match_h:
        total += float(match_h.group(1)) * 60

    # Match minutes (but not in 'Xm' that's part of seconds like 'm30s')
    match_m = re.search(r"(\d+(?:\.\d+)?)m(?!s)", s, re.IGNORECASE)
    if match_m:
        total += float(match_m.group(1))

    return total


def parse_procrastination_table(lines: list[str]) -> DailyScreenTimeData | None:
    """
    Parse the PROCRASTINATION table from daily note lines.

    Args:
        lines: All lines from a daily note

    Returns:
        DailyScreenTimeData or None if no PROCRASTINATION section
    """
    block = _extract_block(lines, "### **PROCRASTINATION**")
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
    for line in block[header_idx + 2:]:  # Skip header and separator
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

        minutes = _parse_duration_to_minutes(duration_raw)
        if minutes > 0:
            entries.append(ScreenTimeEntry(app=source, minutes=minutes))

    if not entries:
        return None

    return DailyScreenTimeData(entries=entries)
