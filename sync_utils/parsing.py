"""
Value parsing and formatting utilities for the journal sync system.

Provides functions for parsing durations, formatting minutes/hours,
computing/formatting percent changes, and other value transformations.
"""
from __future__ import annotations

import math
import re
from collections import OrderedDict


def parse_frontmatter(lines: list[str]) -> OrderedDict:
    """Parse YAML frontmatter from markdown lines into an ordered dict."""
    data = OrderedDict()
    if not lines or lines[0].strip() != "---":
        return data
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return data
    for line in lines[1:end_idx]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def parse_duration_to_minutes(val) -> float | None:
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
    total = hours * 60 + minutes + (seconds / 60)
    return total


def format_minutes(total_minutes, always_show_both: bool = False) -> str:
    """
    Format minutes as XhYm string.
    Always uses two-digit minutes when hours > 0 (e.g., 7h00m, 7h05m).
    If always_show_both=True, always shows both h and m (e.g., 0h00m for 0 minutes).
    """
    if total_minutes is None:
        return ""
    total_minutes = max(0, float(total_minutes))
    total_minutes = round_half_up(total_minutes)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0 or always_show_both:
        return f"{hours}h{minutes:02d}m"
    return f"{minutes}m"


def format_minutes_seconds(total_minutes_float: float) -> str:
    """Convert minute value (can be float) to XmYYs string."""
    if total_minutes_float is None:
        return ""
    mins = int(total_minutes_float)
    secs = round((total_minutes_float - mins) * 60)
    if secs == 60:
        mins += 1
        secs = 0
    if mins >= 60:
        hours = mins // 60
        rem_mins = mins % 60
        return f"{hours}h{rem_mins:02d}m" if secs == 0 else f"{hours}h{rem_mins:02d}m{secs:02d}s"
    if secs == 0:
        return f"{mins}m"
    return f"{mins}m{secs:02d}s"


def ceil_minutes(val: float) -> int:
    """
    Round minutes upward with a tiny tolerance to avoid float undercounts
    (e.g., 89.0000001 -> 90).
    """
    if val is None:
        return 0
    return int(math.ceil(val - 1e-6))


def round_half_up(val: float) -> int:
    """
    Round to nearest minute, half-up, with tiny tolerance to prevent float drift.
    """
    if val is None:
        return 0
    return int(math.floor(val + 0.5000001))


def parse_bool(val) -> bool:
    """Parse a value as boolean."""
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def compute_percent_change(current, previous) -> float | None:
    """
    Compute percentage change from previous to current.

    - Returns None when previous is None or zero and current > 0 (avoids +∞%).
    - Returns 0 when both current and previous are zero (explicit 0%).
    """
    if current is None or previous is None:
        return None
    if previous == 0:
        return 0 if current == 0 else None
    return ((current - previous) / previous) * 100


def format_percent_change(pct) -> str:
    """
    Format percentage change as +X% or -X%.
    Uses an em dash when pct is None (e.g., baseline=0 with a nonzero current).
    """
    if pct is None:
        return "—"
    sign = "+" if pct >= 0 else ""
    return f"{sign}{round_half_up(pct)}%"


def format_training_ratio(count: int, total_days: int) -> str:
    """
    Format workout/stretch as count/total.
    Zero-pad count only for monthly notes (total_days > 7).
    """
    if total_days > 7:
        return f"{count:02d}/{total_days}"
    return f"{count}/{total_days}"


def format_mood_with_scale(val) -> str:
    """Format mood value with /10.0 suffix, always showing one decimal (e.g., 5.0/10.0)."""
    if val is None:
        return "0.0/10.0"
    return f"{val:.1f}/10.0"


def format_ma_training_ratio(avg_count: float | None, unit: str) -> str:
    """
    Format moving average training count with unit suffix.

    Args:
        avg_count: Average count across periods (e.g., 4.5 workouts/week)
        unit: Unit suffix - "7" for weekly, "mo" for monthly, "qtr" for quarterly, "yr" for yearly

    Returns:
        Formatted string like "4.5/7", "17.3/mo", "50.5/qtr", "168/yr"
        Returns "—" if avg_count is None.
    """
    if avg_count is None:
        return "—"
    if unit == "7":
        # Weekly: show one decimal
        return f"{avg_count:.1f}/7"
    elif unit == "yr":
        # Yearly: round to integer
        return f"{round(avg_count)}/{unit}"
    else:
        # Monthly, quarterly: show one decimal
        return f"{avg_count:.1f}/{unit}"

