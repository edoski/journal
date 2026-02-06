"""Typed contracts for parsed daily aggregates and period aggregates."""

from __future__ import annotations

from typing import TypedDict


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
    activity_totals: dict[str, float]
    interrupt_minutes: float
    overrun_minutes: float
    planned_break_minutes: float
    training_type_minutes: dict[str, float]
    training_type_sessions: dict[str, int]
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
