"""
Period metrics model for the journal sync system.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PeriodMetrics:
    """Aggregated metrics for a time period (week, month, quarter, year)."""

    study_total_minutes: float
    sleep_avg_minutes: float | None
    mood_avg: float | None
    workout_count: int
    stretch_count: int
    total_days: int
    days_up_to_today: int
