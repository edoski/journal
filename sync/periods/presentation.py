"""Presentation preparation for period metric sections."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from sync.contracts.metrics import DailyAggregate
from sync.dates import daterange, format_week_label
from sync.writers.charts import (
    MonthlyTrainingGridSpec,
    VerticalBarProfile,
    VerticalBarSpec,
    WeeklyTrainingGridSpec,
)


@dataclass(frozen=True)
class PeriodBuckets:
    """Prepared date buckets for period chart and table sections."""

    ranges: Sequence[tuple[datetime.date, datetime.date]]
    labels: Sequence[str]
    day_lists: list[list[datetime.date]]


def period_buckets(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    labels: Sequence[str],
) -> PeriodBuckets:
    """Build reusable day lists for labeled period buckets."""
    return PeriodBuckets(
        ranges=ranges,
        labels=labels,
        day_lists=[list(daterange(start, end)) for start, end in ranges],
    )


def _current_bucket_index(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    current_date: datetime.date | None,
) -> tuple[int, int] | tuple[None, None]:
    if current_date is None:
        return None, None
    for bucket_idx, (start, end) in enumerate(ranges):
        if start <= current_date <= end:
            return bucket_idx, (current_date - start).days
    return None, None


def bucket_average_bar_spec(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    labels: Sequence[str],
    *,
    today: datetime.date,
    value_for_day: Callable[[datetime.date], float | None],
    chart_value: Callable[[float], float],
    value_label: Callable[[float], str],
    zero_label: str,
    profile: VerticalBarProfile,
    delta_labels: Sequence[str] | None = None,
) -> VerticalBarSpec:
    buckets = period_buckets(ranges, labels)
    chart_values: list[float] = []
    value_labels: list[str] = []

    for (start, _), days in zip(buckets.ranges, buckets.day_lists):
        values = [value for day in days if (value := value_for_day(day)) is not None]
        if values:
            avg_value = sum(values) / len(values)
            chart_values.append(chart_value(avg_value))
            value_labels.append("" if start > today else value_label(avg_value))
        else:
            chart_values.append(0)
            value_labels.append("" if start > today else zero_label)

    return VerticalBarSpec(
        labels=buckets.labels,
        values=chart_values,
        value_labels=value_labels,
        profile=profile,
        delta_labels=delta_labels,
    )


def weekly_training_grid_spec(
    dates: Sequence[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    workout_count: int,
    stretch_count: int,
    current_date: datetime.date | None,
) -> WeeklyTrainingGridSpec:
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []
    for day in dates:
        payload = daily_data.get(day)
        workout_symbols.append("███" if payload and payload.get("workout") else "░░░")
        stretch_symbols.append("███" if payload and payload.get("stretch") else "░░░")

    current_index = None
    date_list = list(dates)
    if (
        current_date is not None
        and date_list
        and date_list[0] <= current_date <= date_list[-1]
    ):
        current_index = (current_date - date_list[0]).days

    return WeeklyTrainingGridSpec(
        workout_symbols=workout_symbols,
        stretch_symbols=stretch_symbols,
        workout_count=workout_count,
        stretch_count=stretch_count,
        current_index=current_index,
    )


def monthly_training_grid_spec(
    week_ranges: Sequence[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    current_date: datetime.date | None,
    workout_delta_labels: Sequence[str] | None = None,
    stretch_delta_labels: Sequence[str] | None = None,
) -> MonthlyTrainingGridSpec:
    week_labels: list[str] = []
    week_day_counts: list[int] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []

    for start, end in week_ranges:
        days = list(daterange(start, end))
        week_day_counts.append(len(days))
        week_labels.append(format_week_label(start, end))
        for day in days:
            payload = daily_data.get(day)
            workout_symbols.append("■" if payload and payload.get("workout") else "·")
            stretch_symbols.append("■" if payload and payload.get("stretch") else "·")

    current_week_idx, current_day_idx = _current_bucket_index(week_ranges, current_date)
    return MonthlyTrainingGridSpec(
        week_labels=week_labels,
        week_day_counts=week_day_counts,
        workout_symbols=workout_symbols,
        stretch_symbols=stretch_symbols,
        current_week_index=current_week_idx,
        current_day_index=current_day_idx,
        workout_delta_labels=workout_delta_labels,
        stretch_delta_labels=stretch_delta_labels,
    )
