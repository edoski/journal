"""Typed contracts for parsed daily aggregates and period aggregates."""

from __future__ import annotations

from typing import TypeAlias, TypedDict


class DailyAggregate(TypedDict):
    """Parsed aggregate metrics for a single daily note."""

    study_minutes: float
    sleep_minutes: float | None
    mood: float | None
    workout: bool
    stretch: bool
    meditate: bool
    awake_minutes: float | None
    awakenings: int | None
    sleep_asleep_time: str | None
    sleep_awake_time: str | None
    activity_totals: dict[str, float]
    interrupt_minutes: float
    overrun_minutes: float
    planned_break_minutes: float
    training_type_minutes: dict[str, float]
    training_type_sessions: dict[str, int]
    training_type_start_minutes: dict[str, tuple[int, ...]]
    training_type_end_minutes: dict[str, tuple[int, ...]]
    screen_time_totals: dict[str, float]


class PeriodAggregate(TypedDict):
    """Aggregate metrics for a period window."""

    study_total_minutes: float
    sleep_avg_minutes: float | None
    mood_avg: float | None
    workout_count: int
    stretch_count: int
    mindful_count: int
    total_days: int
    days_up_to_today: int


class TrainingTypeSessionStat(TypedDict):
    """Per-type training summary row for periodic rendering."""

    type: str
    sessions: int
    target: int
    average_minutes: float
    average_start_time: str
    average_end_time: str


class MovingAverageAggregate(TypedDict):
    """Moving-average view over prior period aggregates."""

    study_avg_minutes: float | None
    sleep_avg_minutes: float | None
    mood_avg: float | None
    workout_avg: float | None
    stretch_avg: float | None
    mindful_avg: float | None


MetricValue: TypeAlias = float | int | None
