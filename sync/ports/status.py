"""Daily status source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.contracts.screen_time import DailyScreenTimeData
from sync.contracts.status import SleepPayload, TrainingStatus


class DailyStatusSource(Protocol):
    """Loads daily training/sleep/screen-time status payloads."""

    def target_days(self, anchor_day: datetime.date) -> tuple[datetime.date, ...]:
        """Resolve all days that should be synced for this run."""

    def load_training(self, day: datetime.date) -> TrainingStatus:
        """Load training payloads and completion state for a day."""

    def load_sleep(self, day: datetime.date) -> SleepPayload | None:
        """Load sleep payload for a day if available."""

    def load_screen_time(self, day: datetime.date) -> DailyScreenTimeData | None:
        """Load grouped screen-time payload for a day if available."""

    def write_study_times(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
        day_schedule: DayScheduleProfile,
    ) -> None:
        """Persist study-time boundaries consumed by shortcuts."""
