#!/usr/bin/env python3
"""Monthly sync composition root."""

from __future__ import annotations

import argparse
import datetime

from sync.adapters import (
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
    JsonMediaDateCacheStore,
    MarkdownDailyAggregateSource,
    MarkdownGoalStore,
    MarkdownNoteStore,
    ObsidianMediaSource,
)
from sync.adapters.cache_bootstrap import bootstrap_cache_layout
from sync.application.goal_sync_service import GoalSyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_month_window


def main() -> None:
    bootstrap_cache_layout()
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

    note_store = MarkdownNoteStore()
    goal_store = MarkdownGoalStore()
    carry_cache_store = JsonGoalCarryForwardCacheStore()
    reconcile_cache_store = JsonGoalReconcileCacheStore()
    media_cache_store = JsonMediaDateCacheStore()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=MarkdownDailyAggregateSource(),
        media_source=ObsidianMediaSource(media_cache_store=media_cache_store),
        goal_sync_service=GoalSyncService(
            note_store=note_store,
            goal_store=goal_store,
            carry_cache_store=carry_cache_store,
            reconcile_cache_store=reconcile_cache_store,
        ),
    )
    service.sync_month(window, note_path, cleanup_previous=not args.no_cleanup)


if __name__ == "__main__":
    main()
