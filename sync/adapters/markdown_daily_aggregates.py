"""Markdown daily aggregate source adapter."""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR
from sync.contracts.metrics import DailyAggregate
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.readers.daily import parse_daily_note

_CANONICAL_STUDY_HEADER = (
    "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |"
)


def _raise_window_schema_error(
    offenders: list[tuple[datetime.date, str, str]],
) -> None:
    lines = [
        f"Invalid daily note schema in requested window ({len(offenders)} file(s))"
    ]
    for day, path, reason in offenders:
        lines.append(f"- {day.isoformat()} | {path} | {reason}")
    lines.append(f"Required canonical STUDY header: '{_CANONICAL_STUDY_HEADER}'")
    raise ValueError("\n".join(lines))


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
        offenders: list[tuple[datetime.date, str, str]] = []

        for day in sorted(set(dates)):
            path = os.path.join(self.journal_dir, f"{day:%Y-%m-%d}.md")
            if not os.path.exists(path):
                continue

            try:
                parsed = parse_daily_note(path)
            except ValueError as exc:
                offenders.append((day, path, str(exc)))
                continue

            if parsed:
                data[day] = parsed

        if offenders:
            _raise_window_schema_error(offenders)

        return data
