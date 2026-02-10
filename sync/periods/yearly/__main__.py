#!/usr/bin/env python3
"""Yearly sync composition root."""

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
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_year_window


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate yearly metrics from daily notes."
    )
    add_logging_cli_args(parser)
    parser.add_argument("--file", help="Path to yearly note")
    parser.add_argument("--year", help="Year (YYYY)")
    args = parser.parse_args()
    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)
    logger = get_logger(__name__)
    bootstrap_cache_layout()

    if args.year:
        year = int(args.year)
    else:
        year = datetime.date.today().year

    window = build_year_window(year)
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
    try:
        service.sync_year(window, note_path)
    except Exception:
        logger.exception("Yearly sync failed for %s", window.filename)
        raise


if __name__ == "__main__":
    main()
