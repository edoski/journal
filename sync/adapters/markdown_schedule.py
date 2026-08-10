"""Markdown-backed schedule source adapter."""

from __future__ import annotations

import datetime

from sync.constants import SCHEDULE_PATH
from sync.contracts.schedule import DayScheduleProfile
from sync.io import safe_read_file
from sync.ports.schedule import ScheduleSource
from sync.readers.schedule import parse_schedule_rules


class MarkdownScheduleSource(ScheduleSource):
    """Resolve daily schedule profiles from PROTOCOL.md."""

    def __init__(self, path: str = SCHEDULE_PATH) -> None:
        self.path = path

    def resolve_day(self, day: datetime.date) -> DayScheduleProfile:
        """Load rules from markdown and resolve one day's schedule profile."""
        lines = safe_read_file(self.path)
        if lines is None:
            raise FileNotFoundError(f"Required schedule config not found: {self.path}")
        try:
            rules = parse_schedule_rules(lines)
            return rules.resolve_day(day)
        except ValueError as exc:
            raise ValueError(f"Invalid schedule config at {self.path}: {exc}") from exc
