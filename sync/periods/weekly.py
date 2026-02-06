#!/usr/bin/env python3
"""Weekly sync composition root."""

from __future__ import annotations

import argparse
import datetime

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_week_window


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate weekly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to weekly note")
    parser.add_argument("--date", help="Date within week (YYYY-MM-DD)")
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period (used internally to avoid recursion)",
    )
    args = parser.parse_args()

    if args.date:
        target_date = datetime.datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    window = build_week_window(target_date)
    note_path = resolve_note_path(window.filename, args.file)

    service = PeriodSyncService(
        note_store=MarkdownNoteStore(),
        aggregate_source=MarkdownDailyAggregateSource(),
        goal_store=MarkdownGoalStore(),
    )
    service.sync_week(window, note_path, cleanup_previous=not args.no_cleanup)


if __name__ == "__main__":
    main()
