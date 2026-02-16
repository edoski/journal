"""Markdown-backed schedule source adapter."""

from __future__ import annotations

import datetime

from sync.constants import SCHEDULE_PATH
from sync.contracts.schedule import DayScheduleProfile
from sync.ports.schedule import ScheduleSource
from sync.readers.schedule import load_schedule_rules


class MarkdownScheduleSource(ScheduleSource):
    """Resolve daily schedule profiles from PROTOCOL.md."""

    def __init__(self, path: str = SCHEDULE_PATH) -> None:
        self.path = path

    def resolve_day(self, day: datetime.date) -> DayScheduleProfile:
        """Load rules from markdown and resolve one day's schedule profile."""
        rules = load_schedule_rules(self.path)
        return rules.resolve_day(day)
