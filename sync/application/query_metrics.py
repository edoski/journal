"""Metric definitions and aggregation helpers for query workflows."""

from __future__ import annotations

import datetime
import logging
from collections.abc import Callable

from sync.application.study_targets import resolve_study_target_minutes
from sync.constants import IDEAL, STUDY_TARGET_MIN
from sync.contracts.metrics import DailyAggregate, MetricValue
from sync.contracts.query import BreakdownRow, MetricDefinition
from sync.contracts.schedule import DayScheduleProfile
from sync.formatting import compute_percent_change
from sync.metrics import (
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    compute_period_metrics,
)
from sync.target_policy import (
    target_for_metric as resolve_target_for_metric,
    training_type_target,
)

METRIC_DEFINITIONS: tuple[MetricDefinition, ...] = (
    MetricDefinition(
        key="study_minutes",
        label="Study",
        unit="min",
        precision=0,
        higher_is_better=True,
        target=float(STUDY_TARGET_MIN),
    ),
    MetricDefinition(
        key="sleep_minutes",
        label="Sleep",
        unit="min",
        precision=0,
        higher_is_better=True,
        target=float(IDEAL.sleep_minutes_nightly),
    ),
    MetricDefinition(
        key="workout_count",
        label="Workout",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=float(training_type_target(7, "workout")),
    ),
    MetricDefinition(
        key="stretch_count",
        label="Stretch",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=float(training_type_target(7, "stretch")),
    ),
    MetricDefinition(
        key="meditation_count",
        label="Meditation",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=float(training_type_target(7, "meditation")),
    ),
    MetricDefinition(
        key="interrupt_minutes",
        label="Interruptions",
        unit="min",
        precision=0,
        higher_is_better=False,
        target=0.0,
    ),
    MetricDefinition(
        key="overrun_minutes",
        label="Overruns",
        unit="min",
        precision=0,
        higher_is_better=False,
        target=0.0,
    ),
    MetricDefinition(
        key="training_sessions_total",
        label="Training Sessions",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=None,
    ),
)

MOVING_AVG_LOOKBACK = {
    "day": 7,
    "week": 4,
    "month": 3,
    "quarter": 4,
    "year": 3,
}

METRIC_LAB_LOOKBACK = {
    "day": 14,
    "week": 12,
    "month": 12,
    "quarter": 8,
    "year": 5,
}


def metric_value_as_float(value: MetricValue) -> float | None:
    """Normalize metric payloads to float values when possible."""
    if value is None:
        return None
    return float(value)


def average_metric_values(values: list[MetricValue]) -> float | None:
    """Average a sequence of optional metric values."""
    cleaned = [
        parsed
        for value in values
        if (parsed := metric_value_as_float(value)) is not None
    ]
    if not cleaned:
        return None
    return sum(cleaned) / len(cleaned)


def build_breakdown_rows(totals: dict[str, float]) -> tuple[BreakdownRow, ...]:
    """Build sorted percentage rows from a breakdown totals map."""
    if not totals:
        return tuple()

    total_value = sum(float(value or 0) for value in totals.values())
    rows = sorted(
        (
            (label, float(value or 0))
            for label, value in totals.items()
            if float(value or 0) > 0
        ),
        key=lambda item: (-item[1], item[0].casefold()),
    )
    if not rows:
        return tuple()

    return tuple(
        BreakdownRow(
            label=label,
            value=value,
            percent=(value / total_value) if total_value > 0 else None,
        )
        for label, value in rows
    )


def training_totals_by_type(
    daily_data: dict[datetime.date, DailyAggregate],
) -> dict[str, float]:
    """Aggregate per-type training totals from daily aggregate payloads."""
    totals: dict[str, float] = {}
    for payload in daily_data.values():
        for label, value in payload.get("training_type_minutes", {}).items():
            amount = float(value or 0)
            if amount <= 0:
                continue
            totals[label] = totals.get(label, 0.0) + amount
    return totals


def build_metrics_map(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> dict[str, MetricValue]:
    """Build the canonical query metric map for a date span."""
    period_metrics = compute_period_metrics(dates, daily_data)
    interrupt_total, overrun_total, _ = aggregate_interrupt_overrun(dates, daily_data)
    training_sessions_total = 0
    for payload in daily_data.values():
        sessions_map = payload.get("training_type_sessions", {})
        training_sessions_total += sum(
            int(value or 0) for value in sessions_map.values()
        )

    return {
        "study_minutes": period_metrics["study_total_minutes"],
        "sleep_minutes": period_metrics["sleep_avg_minutes"],
        "workout_count": period_metrics["workout_count"],
        "stretch_count": period_metrics["stretch_count"],
        "meditation_count": period_metrics["meditation_count"],
        "interrupt_minutes": interrupt_total,
        "overrun_minutes": overrun_total,
        "training_sessions_total": training_sessions_total,
        "days_total": period_metrics["total_days"],
        "days_elapsed": period_metrics["days_up_to_today"],
    }


def study_target_minutes(
    dates: list[datetime.date],
    *,
    schedule_resolver: Callable[[datetime.date], DayScheduleProfile],
    logger: logging.Logger,
) -> int | None:
    """Resolve study targets for query views."""
    return resolve_study_target_minutes(
        dates,
        schedule_resolver=schedule_resolver,
        logger=logger,
    )


def metric_target(
    key: str,
    *,
    days_total: int,
    dates: list[datetime.date],
    schedule_resolver: Callable[[datetime.date], DayScheduleProfile],
    logger: logging.Logger,
) -> float | None:
    """Resolve the target for one query metric row."""
    if key == "study_minutes":
        study_target = study_target_minutes(
            dates,
            schedule_resolver=schedule_resolver,
            logger=logger,
        )
        return float(study_target) if study_target is not None else None
    return resolve_target_for_metric(key, days_total)


def delta_percent(current: MetricValue, previous: MetricValue) -> float | None:
    """Compute percent delta between two metric payloads."""
    return compute_percent_change(
        metric_value_as_float(current),
        metric_value_as_float(previous),
    )


def activity_breakdown(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> tuple[BreakdownRow, ...]:
    """Build study activity breakdown rows."""
    return build_breakdown_rows(aggregate_activity_totals(dates, daily_data))


def training_breakdown(
    daily_data: dict[datetime.date, DailyAggregate],
) -> tuple[BreakdownRow, ...]:
    """Build training-type breakdown rows."""
    return build_breakdown_rows(training_totals_by_type(daily_data))
