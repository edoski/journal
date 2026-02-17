"""Trend and delta helpers for period metrics."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Sequence
from typing import Literal

from sync.contracts.metrics import MovingAverageAggregate, PeriodAggregate
from sync.formatting import (
    compute_non_none_average,
    compute_pace,
    format_bucket_delta_change_label,
)

BucketDeltaMode = Literal["pace", "average"]


def compute_bucket_deltas(
    buckets: Sequence[Sequence[datetime.date]],
    *,
    value_for_day: Callable[[datetime.date], float | None],
    baseline_bucket: Sequence[datetime.date] | None = None,
    mode: BucketDeltaMode = "pace",
    today: datetime.date | None = None,
) -> list[str]:
    """
    Compute per-bucket deltas using consistent period semantics.

    Semantics:
    - Current bucket uses observed days up to ``today``.
    - Previous bucket uses the full previous bucket (or baseline bucket for index 0).
    - Future buckets return blank strings.
    - ``mode="pace"`` compares per-day pace (sum / day_count).
    - ``mode="average"`` compares averages of non-None values.
    """
    if mode not in ("pace", "average"):
        raise ValueError(f"Unsupported bucket delta mode: {mode}")

    today = today or datetime.date.today()
    deltas: list[str] = []

    for idx, bucket in enumerate(buckets):
        if not bucket:
            deltas.append("—")
            continue
        if bucket[0] > today:
            deltas.append("")
            continue

        current_days = [day for day in bucket if day <= today]
        if not current_days:
            deltas.append("—")
            continue

        previous_bucket = buckets[idx - 1] if idx > 0 else baseline_bucket
        if not previous_bucket:
            deltas.append("—")
            continue
        previous_days = list(previous_bucket)

        if mode == "pace":
            current_total = sum(
                float(value_for_day(day) or 0.0) for day in current_days
            )
            previous_total = sum(
                float(value_for_day(day) or 0.0) for day in previous_days
            )
            current_value = compute_pace(current_total, len(current_days))
            previous_value = compute_pace(previous_total, len(previous_days))
        else:
            current_value = compute_non_none_average(
                [value_for_day(day) for day in current_days]
            )
            previous_value = compute_non_none_average(
                [value_for_day(day) for day in previous_days]
            )

        deltas.append(format_bucket_delta_change_label(current_value, previous_value))

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
    for period in recent:
        total = period.get("study_total_minutes")
        days = int(period.get("days_up_to_today") or period.get("total_days") or 1)
        study_avgs.append(compute_pace(total, days))
    study_ma = sum(study_avgs) / len(study_avgs) if study_avgs else None

    # Sleep: average of averages
    sleep_vals = [period.get("sleep_avg_minutes") for period in recent]
    sleep_ma = (
        compute_non_none_average(sleep_vals)
        if any(v is not None for v in sleep_vals)
        else None
    )

    # Mood: average of averages
    mood_vals = [period.get("mood_avg") for period in recent]
    mood_ma = (
        compute_non_none_average(mood_vals)
        if any(v is not None for v in mood_vals)
        else None
    )

    # Workout: average count per period
    workout_counts = [period.get("workout_count", 0) for period in recent]
    workout_ma = sum(workout_counts) / len(workout_counts) if workout_counts else None

    # Stretch: average count per period
    stretch_counts = [period.get("stretch_count", 0) for period in recent]
    stretch_ma = sum(stretch_counts) / len(stretch_counts) if stretch_counts else None

    # Mindful: average count per period
    mindful_counts = [period.get("mindful_count", 0) for period in recent]
    mindful_ma = sum(mindful_counts) / len(mindful_counts) if mindful_counts else None

    return MovingAverageAggregate(
        study_avg_minutes=study_ma,
        sleep_avg_minutes=sleep_ma,
        mood_avg=mood_ma,
        workout_avg=workout_ma,
        stretch_avg=stretch_ma,
        mindful_avg=mindful_ma,
    )
