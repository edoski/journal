#!/usr/bin/env python3
"""Quarterly sync composition root."""

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
from sync.dates import quarter_of_date
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_quarter_window


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate quarterly metrics from daily notes."
    )
    add_logging_cli_args(parser)
    parser.add_argument("--file", help="Path to quarterly note")
    parser.add_argument("--quarter", help="Quarter (YYYY-Qn, e.g., 2025-Q4)")
    args = parser.parse_args()
    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)
    logger = get_logger(__name__)
    bootstrap_cache_layout()

    if args.quarter:
        parts = args.quarter.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    window = build_quarter_window(year, quarter_num)
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
        service.sync_quarter(window, note_path)
    except Exception:
        logger.exception("Quarterly sync failed for %s", window.filename)
        raise


if __name__ == "__main__":
    main()
