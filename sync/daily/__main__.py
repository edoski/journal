#!/usr/bin/env python3
"""
Entry point for running daily sync as a module.

Usage:
    python -m sync.daily
"""

from __future__ import annotations

import argparse
import datetime

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.json_daily_cache import (
    JsonDailyScreenTimeCacheStore,
    JsonDailyTrainingCacheStore,
)
from sync.adapters.json_goal_cache import (
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
)
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.adapters.vault_context import VaultContextSource
from sync.adapters.cache_bootstrap import bootstrap_cache_layout
from sync.application.daily_sync_service import DailySyncService
from sync.application.goal_sync_service import GoalSyncService
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)


def main(argv: list[str] | None = None) -> None:
    """Run the daily sync process."""
    parser = argparse.ArgumentParser(description="Run daily journal sync.")
    add_logging_cli_args(parser)
    args = parser.parse_args(argv)
    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)
    logger = get_logger(__name__)

    bootstrap_cache_layout()
    day = datetime.date.today()
    session_source = FlowStudySessionSource()
    note_store = MarkdownNoteStore()
    goal_store = MarkdownGoalStore()
    carry_cache_store = JsonGoalCarryForwardCacheStore()
    reconcile_cache_store = JsonGoalReconcileCacheStore()
    training_cache_store = JsonDailyTrainingCacheStore()
    screen_time_cache_store = JsonDailyScreenTimeCacheStore()
    service = DailySyncService(
        note_store=note_store,
        status_source=ICloudDailyStatusSource(
            screen_time_cache_store=screen_time_cache_store
        ),
        context_source=VaultContextSource(),
        reminder_store=MarkdownReminderRuleStore(),
        goal_sync_service=GoalSyncService(
            note_store=note_store,
            goal_store=goal_store,
            carry_cache_store=carry_cache_store,
            reconcile_cache_store=reconcile_cache_store,
        ),
        training_cache_store=training_cache_store,
    )
    sessions = session_source.load_sessions(day)
    try:
        changed = service.sync_day(day, sessions)
        if changed is False:
            # Suppress noisy success logs on no-op runs.
            pass
    except Exception:
        logger.exception("Daily sync failed")
        raise


if __name__ == "__main__":
    main()
