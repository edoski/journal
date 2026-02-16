"""Session source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord


class StudySessionSource(Protocol):
    """Loads study sessions for a day."""

    def load_sessions(
        self,
        day: datetime.date,
        day_schedule: DayScheduleProfile,
    ) -> list[StudySessionRecord]:
        """Return sessions for the provided date."""
