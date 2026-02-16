"""Schedule source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.schedule import DayScheduleProfile


class ScheduleSource(Protocol):
    """Resolve canonical schedule profiles for specific days."""

    def resolve_day(self, day: datetime.date) -> DayScheduleProfile:
        """Return the resolved schedule profile for a calendar day."""
