"""
Period metrics computation for the journal sync system.

Provides functions for aggregating study, sleep, mood, and training
metrics across date ranges, and computing period-over-period deltas.
"""
from __future__ import annotations

import datetime
import os
from typing import Any

from .constants import JOURNAL_DIR
from .parsing import compute_percent_change, format_percent_change


def load_daily_data(start_date: datetime.date, end_date: datetime.date) -> dict[datetime.date, dict[str, Any]]:
    """Load parsed daily notes for a date range."""
    # Import here to avoid circular dependency
    from .notes import parse_daily_note
    from .dates import daterange
    
    data = {}
    for day in daterange(start_date, end_date):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            data[day] = parsed
    return data


def compute_period_metrics(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> dict[str, Any]:
    """
    Compute aggregated metrics for a list of dates.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Dict with keys: study_total_minutes, sleep_avg_minutes, mood_avg,
        workout_count, stretch_count, total_days, days_up_to_today.
    """
    today = datetime.date.today()
    dates_up_to_today = [d for d in dates if d <= today]
    days_up_to_today = len(dates_up_to_today)

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

    study_total = sum((m for m in study_minutes if m is not None), 0)
    sleep_vals = [m for m in sleep_minutes if m is not None]
    sleep_avg = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    mood_vals_clean = [m for m in mood_vals if m is not None]
    mood_avg = sum(mood_vals_clean) / len(mood_vals_clean) if mood_vals_clean else None

    workout_count = sum(1 for d in dates if daily_data.get(d, {}).get("workout"))
    stretch_count = sum(1 for d in dates if daily_data.get(d, {}).get("stretch"))

    return {
        "study_total_minutes": study_total,
        "sleep_avg_minutes": sleep_avg,
        "mood_avg": mood_avg,
        "workout_count": workout_count,
        "stretch_count": stretch_count,
        "total_days": len(dates),
        "days_up_to_today": days_up_to_today,
    }


def aggregate_activity_totals(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> dict[str, float]:
    """
    Aggregate study activity totals across a date range.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Dict mapping activity names to total minutes.
    """
    activity_totals: dict[str, float] = {}
    for d in dates:
        daily = daily_data.get(d)
        if not daily:
            continue
        for activity, mins in daily.get("activity_totals", {}).items():
            activity_totals[activity] = activity_totals.get(activity, 0) + mins
    return activity_totals


def aggregate_interrupt_overrun(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> tuple[float, float, int]:
    """
    Aggregate interrupt and overrun minutes across a date range.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Tuple of (total_interrupts, total_overruns, study_day_count).
        study_day_count is the number of days with any study (for averaging).
    """
    total_interrupts = 0.0
    total_overruns = 0.0
    study_day_count = 0
    for d in dates:
        daily = daily_data.get(d, {})
        total_interrupts += daily.get("interrupt_minutes", 0) or 0
        total_overruns += daily.get("overrun_minutes", 0) or 0
        study_minutes = daily.get("study_minutes") or 0
        if study_minutes > 0:
            study_day_count += 1
    return total_interrupts, total_overruns, study_day_count


def compute_period_deltas(
    counts: list[tuple[int, int, datetime.date]],
    baseline: int | None,
    today: datetime.date | None = None,
) -> list[str]:
    """
    Compute percent change deltas for a sequence of period counts.

    This consolidates the repeated delta calculation pattern used in
    quarterly_sync.py and yearly_sync.py.

    Args:
        counts: List of (done, elapsed, start_date) tuples for each period.
        baseline: The count from the previous comparable period (e.g., last
                  quarter of previous year for Q1 comparison).
        today: Reference date for skipping future periods. Defaults to today.

    Returns:
        List of formatted delta strings (e.g., "+25%", "-10%", "—").
    """
    today = today or datetime.date.today()
    deltas: list[str] = []
    for idx, (done, _, start) in enumerate(counts):
        if start > today:
            deltas.append("")
            continue
        if idx == 0:
            prev_val = baseline
        else:
            prev_val = counts[idx - 1][0]
        delta = compute_percent_change(done, prev_val)
        deltas.append(format_percent_change(delta))
    return deltas
