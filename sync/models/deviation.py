"""
Deviation data model for the journal sync system.

Contains schedule adherence metrics that track deviations from the ideal schedule.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DailyDeviationData:
    """
    Schedule adherence metrics (non-screen-time deviations).

    Tracks time lost due to:
    - Study session interruptions
    - Break overruns beyond scheduled break time
    - Late study start (vs ideal 8:00 AM)
    - Late workout start (vs ideal 6:00 PM)
    """

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
