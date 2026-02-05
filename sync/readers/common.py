"""
Shared parsing helpers for markdown reader modules.
"""

from __future__ import annotations

import re


def normalize_header(line: str) -> str:
    """Normalize markdown headers for matching, ignoring emphasis markers."""
    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def extract_block(lines: list[str], header: str) -> list[str] | None:
    """Extract lines belonging to a markdown header section."""
    header_norm = normalize_header(header)
    start = -1
    for idx, line in enumerate(lines):
        if normalize_header(line) == header_norm:
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
            and normalize_header(stripped) != header_norm
        ):
            end = idx
            break
    return lines[start:end]


def parse_duration_to_minutes(
    val: str | int | float | None,
    *,
    default: float | None = None,
) -> float | None:
    """
    Parse duration string to minutes.

    Examples:
    - ``1h30m`` -> ``90``
    - ``90m`` -> ``90``
    - ``1m30s`` -> ``1.5``
    """
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)

    s = str(val).strip().strip("`")
    if not s:
        return default

    hours = 0.0
    minutes = 0.0
    seconds = 0.0
    match_h = re.search(r"(\d+(?:\.\d+)?)h", s, re.IGNORECASE)
    match_m = re.search(r"(\d+(?:\.\d+)?)m(?!s)", s, re.IGNORECASE)
    match_s = re.search(r"(\d+(?:\.\d+)?)s", s, re.IGNORECASE)
    if match_h:
        hours = float(match_h.group(1))
    if match_m:
        minutes = float(match_m.group(1))
    if match_s:
        seconds = float(match_s.group(1))

    return hours * 60 + minutes + (seconds / 60)
