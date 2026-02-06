#!/usr/bin/env python3
"""Monthly sync composition root."""

from __future__ import annotations

import argparse
import datetime

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_month_window


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate monthly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to monthly note")
    parser.add_argument("--month", help="Month (YYYY-MM)")
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period (used internally to avoid recursion)",
    )
    args = parser.parse_args()

    if args.month:
        year, month = map(int, args.month.split("-"))
        target_date = datetime.date(year, month, 1)
    else:
        today = datetime.date.today()
        target_date = datetime.date(today.year, today.month, 1)

    window = build_month_window(target_date)
    note_path = resolve_note_path(window.filename, args.file)

    service = PeriodSyncService(
        note_store=MarkdownNoteStore(),
        aggregate_source=MarkdownDailyAggregateSource(),
        goal_store=MarkdownGoalStore(),
    )
    service.sync_month(window, note_path, cleanup_previous=not args.no_cleanup)


if __name__ == "__main__":
    main()
