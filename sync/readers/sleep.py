"""
Sleep table parsing for the journal sync system.
"""

from __future__ import annotations

import re

from sync.models import SleepEntry


def _parse_duration_to_minutes(val: str | int | float | None) -> float | None:
    """Parse duration string (e.g., '1h30m', '90m', '1m30s') to minutes."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().strip("`")
    if not s:
        return None
    hours = 0.0
    minutes = 0.0
    seconds = 0.0
    match_h = re.search(r"(\d+(?:\.\d+)?)h", s)
    match_m = re.search(r"(\d+(?:\.\d+)?)m", s)
    match_s = re.search(r"(\d+(?:\.\d+)?)s", s)
    if match_h:
        hours = float(match_h.group(1))
    if match_m:
        minutes = float(match_m.group(1))
    if match_s:
        seconds = float(match_s.group(1))
    return hours * 60 + minutes + (seconds / 60)


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


def parse_sleep_table(lines: list[str]) -> list[SleepEntry]:
    """
    Parse the SLEEP table from daily note lines.

    Args:
        lines: All lines from a daily note

    Returns:
        List of SleepEntry dataclasses
    """
    block = _extract_block(lines, "### **SLEEP**")
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

        duration_min = _parse_duration_to_minutes(parts[2])
        awake_min = _parse_duration_to_minutes(parts[3])

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
