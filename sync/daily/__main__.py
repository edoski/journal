#!/usr/bin/env python3
"""
Entry point for running daily sync as a module.

Usage:
    python -m sync.daily
"""

from __future__ import annotations

import datetime

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.adapters.vault_context import VaultContextSource
from sync.application.daily_sync_service import DailySyncService


def main() -> None:
    """Run the daily sync process."""
    day = datetime.date.today()
    session_source = FlowStudySessionSource()
    service = DailySyncService(
        note_store=MarkdownNoteStore(),
        status_source=ICloudDailyStatusSource(),
        context_source=VaultContextSource(),
        reminder_store=MarkdownReminderRuleStore(),
    )
    sessions = session_source.load_sessions(day)
    changed = service.sync_day(day, sessions)
    if changed is False:
        # Suppress noisy success logs on no-op runs.
        pass


if __name__ == "__main__":
    main()
