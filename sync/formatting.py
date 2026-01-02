"""
Formatting utilities for the journal sync system.

Provides functions for formatting durations, percentages, and other values
for display in markdown tables and charts.
"""

from __future__ import annotations

import math


def round_half_up(val: float | None) -> int:
    """Round to nearest integer, half-up, with tiny tolerance to prevent float drift."""
    if val is None:
        return 0
    return int(math.floor(val + 0.5000001))


def ceil_minutes(val: float) -> int:
    """Round minutes upward with tiny tolerance to avoid float undercounts."""
    if val is None:
        return 0
    return int(math.ceil(val - 1e-6))


def format_minutes(total_minutes: float | None, always_show_both: bool = False) -> str:
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


def format_minutes_seconds(total_minutes_float: float | None) -> str:
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
        return (
            f"{hours}h{rem_mins:02d}m"
            if secs == 0
            else f"{hours}h{rem_mins:02d}m{secs:02d}s"
        )
    if secs == 0:
        return f"{mins}m"
    return f"{mins}m{secs:02d}s"


def compute_percent_change(
    current: float | None, previous: float | None
) -> float | None:
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


def format_percent_change(pct: float | None) -> str:
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


def format_mood_with_scale(val: float | None) -> str:
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
        return f"{avg_count:.1f}/7"
    elif unit == "yr":
        return f"{round(avg_count)}/{unit}"
    else:
        return f"{avg_count:.1f}/{unit}"
