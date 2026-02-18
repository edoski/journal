"""Deviation contracts for schedule-adherence metrics."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DailyDeviationData:
    """Schedule adherence metrics."""

    interrupt_minutes: float = 0.0
    overrun_minutes: float = 0.0
    late_study_start_minutes: float = 0.0
    late_workout_start_minutes: float = 0.0

    @property
    def total_minutes(self) -> float:
        """Total deviation time across all sources."""
        return (
            self.interrupt_minutes
            + self.overrun_minutes
            + self.late_study_start_minutes
            + self.late_workout_start_minutes
        )
