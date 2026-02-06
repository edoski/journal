"""
Shared parsing helpers for markdown reader modules.
"""

from __future__ import annotations

import re
from sync.notes.markdown import extract_block, normalize_header

__all__ = [
    "normalize_header",
    "extract_block",
    "parse_duration_to_minutes",
]


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
