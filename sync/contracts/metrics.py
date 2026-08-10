"""Typed contracts for parsed daily aggregates and period aggregates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias, TypedDict


@dataclass(frozen=True, slots=True)
class TrainingOccurrence:
    """One complete training session parsed from a daily note."""

    activity: str
    duration_minutes: float
    interrupt_minutes: float
    start_minutes: int
    end_minutes: int


class DailyAggregate(TypedDict):
    """Parsed aggregate metrics for a single daily note."""

    study_minutes: float
    sleep_minutes: float | None
    workout: bool
    stretch: bool
    awake_minutes: float | None
    sleep_asleep_time: str | None
    sleep_awake_time: str | None
    activity_totals: dict[str, float]
    interrupt_minutes: float
    overrun_minutes: float
    planned_break_minutes: float
    training_occurrences: tuple[TrainingOccurrence, ...]


class PeriodAggregate(TypedDict):
    """Aggregate metrics for a period window."""

    study_total_minutes: float
    sleep_avg_minutes: float | None
    workout_count: int
    stretch_count: int
    total_days: int
    days_up_to_today: int


class TrainingTypeSessionStat(TypedDict):
    """Per-type training summary row for periodic rendering."""

    type: str
    sessions: int
    target: int
    average_minutes: float
    average_interrupt_minutes: float
    schedule_range: tuple[str, str]


class MovingAverageAggregate(TypedDict):
    """Moving-average view over prior period aggregates."""

    study_avg_minutes: float | None
    sleep_avg_minutes: float | None
    workout_avg: float | None
    stretch_avg: float | None


MetricValue: TypeAlias = float | int | None
