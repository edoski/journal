"""Daily status source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.daily import SleepStatusPayload, TrainingStatusBundle
from sync.contracts.study import StudySessionRecord
from sync.models.screen_time import DailyScreenTimeData


class DailyStatusSource(Protocol):
    """Loads daily training/sleep/screen-time status payloads."""

    def load_training(self, day: datetime.date) -> TrainingStatusBundle:
        """Load training payloads and completion state for a day."""

    def load_sleep(self, day: datetime.date) -> SleepStatusPayload | None:
        """Load sleep payload for a day if available."""

    def load_screen_time(self, day: datetime.date) -> DailyScreenTimeData | None:
        """Load grouped screen-time payload for a day if available."""

    def write_study_times(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
    ) -> None:
        """Persist study-time boundaries consumed by shortcuts."""
