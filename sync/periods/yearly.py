#!/usr/bin/env python3
"""Yearly sync composition root."""

from __future__ import annotations

import argparse
import datetime

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.goal_sync_service import GoalSyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_year_window


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate yearly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to yearly note")
    parser.add_argument("--year", help="Year (YYYY)")
    args = parser.parse_args()

    if args.year:
        year = int(args.year)
    else:
        year = datetime.date.today().year

    window = build_year_window(year)
    note_path = resolve_note_path(window.filename, args.file)

    note_store = MarkdownNoteStore()
    goal_store = MarkdownGoalStore()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=MarkdownDailyAggregateSource(),
        goal_sync_service=GoalSyncService(note_store=note_store, goal_store=goal_store),
    )
    service.sync_year(window, note_path)


if __name__ == "__main__":
    main()
