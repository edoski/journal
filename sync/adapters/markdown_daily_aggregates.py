"""Markdown daily aggregate source adapter."""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR
from sync.contracts.metrics import DailyAggregate
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.readers.daily import parse_daily_note


class MarkdownDailyAggregateSource(DailyAggregateSource):
    """Load daily aggregates by parsing markdown daily notes."""

    def __init__(self, journal_dir: str = JOURNAL_DIR) -> None:
        self.journal_dir = journal_dir

    def load_for_dates(
        self,
        dates: list[datetime.date],
    ) -> dict[datetime.date, DailyAggregate]:
        """Parse daily markdown notes for the supplied date list."""
        data: dict[datetime.date, DailyAggregate] = {}
        for day in dates:
            path = os.path.join(self.journal_dir, f"{day:%Y-%m-%d}.md")
            if not os.path.exists(path):
                continue
            parsed = parse_daily_note(path)
            if parsed:
                data[day] = parsed
        return data
