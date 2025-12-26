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


def compute_moving_average(
    period_metrics: list[dict[str, Any]],
    n_periods: int,
) -> dict[str, Any]:
    """
    Compute moving average metrics across N prior periods.

    Args:
        period_metrics: List of period metric dicts (oldest first), each containing:
            - study_avg_minutes: daily average study in minutes
            - sleep_avg_minutes: average sleep in minutes
            - mood_avg: average mood
            - workout_count: number of workout days
            - stretch_count: number of stretch days
            - total_days: number of days in period
        n_periods: Number of periods required for a valid moving average

    Returns:
        Dict with MA values for each metric. Returns None values if
        insufficient periods (< n_periods) are provided.
    """
    empty_result = {
        "study_avg_minutes": None,
        "sleep_avg_minutes": None,
        "mood_avg": None,
        "workout_avg": None,
        "stretch_avg": None,
    }

    if len(period_metrics) < n_periods:
        return empty_result

    # Take only the last n_periods
    recent = period_metrics[-n_periods:]

    # Study: average of daily averages
    study_avgs = []
    for pm in recent:
        total = pm.get("study_total_minutes") or 0
        days = pm.get("days_up_to_today") or pm.get("total_days") or 1
        study_avgs.append(total / max(1, days))
    study_ma = sum(study_avgs) / len(study_avgs) if study_avgs else None

    # Sleep: average of averages
    sleep_vals = [pm.get("sleep_avg_minutes") for pm in recent if pm.get("sleep_avg_minutes") is not None]
    sleep_ma = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None

    # Mood: average of averages
    mood_vals = [pm.get("mood_avg") for pm in recent if pm.get("mood_avg") is not None]
    mood_ma = sum(mood_vals) / len(mood_vals) if mood_vals else None

    # Workout: average count per period
    workout_counts = [pm.get("workout_count", 0) for pm in recent]
    workout_ma = sum(workout_counts) / len(workout_counts) if workout_counts else None

    # Stretch: average count per period
    stretch_counts = [pm.get("stretch_count", 0) for pm in recent]
    stretch_ma = sum(stretch_counts) / len(stretch_counts) if stretch_counts else None

    return {
        "study_avg_minutes": study_ma,
        "sleep_avg_minutes": sleep_ma,
        "mood_avg": mood_ma,
        "workout_avg": workout_ma,
        "stretch_avg": stretch_ma,
    }

