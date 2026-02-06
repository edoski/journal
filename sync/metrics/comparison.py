"""Comparison and trend helpers for period metrics."""

from __future__ import annotations

import datetime

from sync.contracts.metrics import MovingAverageAggregate, PeriodAggregate
from sync.formatting import compute_percent_change, format_percent_change


def group_screen_time_by_percent(
    totals: dict[str, float],
    percent_threshold: float = 0.05,
) -> dict[str, float]:
    """
    Re-group aggregated screen time totals by percentage threshold.

    Apps ≤ percent_threshold get merged into Miscellaneous.
    Used for periodic notes to avoid cluttering charts with small apps.

    Args:
        totals: Dict mapping app names to total minutes.
        percent_threshold: Apps at or below this percentage get grouped.

    Returns:
        Dict with small apps merged into Miscellaneous.
    """
    if not totals:
        return {}

    total = sum(totals.values())
    if total == 0:
        return totals

    result: dict[str, float] = {}
    misc_total = 0.0
    misc_label = "Miscellaneous"

    for app, minutes in totals.items():
        pct = minutes / total
        if pct > percent_threshold:
            result[app] = minutes
        else:
            misc_total += minutes

    if misc_total > 0:
        result[misc_label] = result.get(misc_label, 0) + misc_total

    return result


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
    period_metrics: list[PeriodAggregate],
    n_periods: int,
) -> MovingAverageAggregate:
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
    empty_result = MovingAverageAggregate(
        study_avg_minutes=None,
        sleep_avg_minutes=None,
        mood_avg=None,
        workout_avg=None,
        stretch_avg=None,
        mindful_avg=None,
    )

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
    sleep_vals = [
        pm.get("sleep_avg_minutes")
        for pm in recent
        if pm.get("sleep_avg_minutes") is not None
    ]
    sleep_ma = (
        sum(float(v) for v in sleep_vals if v is not None) / len(sleep_vals)
        if sleep_vals
        else None
    )

    # Mood: average of averages
    mood_vals = [pm.get("mood_avg") for pm in recent if pm.get("mood_avg") is not None]
    mood_ma = (
        sum(float(v) for v in mood_vals if v is not None) / len(mood_vals)
        if mood_vals
        else None
    )

    # Workout: average count per period
    workout_counts = [pm.get("workout_count", 0) for pm in recent]
    workout_ma = sum(workout_counts) / len(workout_counts) if workout_counts else None

    # Stretch: average count per period
    stretch_counts = [pm.get("stretch_count", 0) for pm in recent]
    stretch_ma = sum(stretch_counts) / len(stretch_counts) if stretch_counts else None

    # Mindful: average count per period
    mindful_counts = [pm.get("mindful_count", 0) for pm in recent]
    mindful_ma = sum(mindful_counts) / len(mindful_counts) if mindful_counts else None

    return MovingAverageAggregate(
        study_avg_minutes=study_ma,
        sleep_avg_minutes=sleep_ma,
        mood_avg=mood_ma,
        workout_avg=workout_ma,
        stretch_avg=stretch_ma,
        mindful_avg=mindful_ma,
    )
