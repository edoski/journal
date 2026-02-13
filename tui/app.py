"""Composition root for the interactive journal shell TUI."""

from __future__ import annotations

import curses

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.application.query_service import QueryService
from sync.log import configure_logging, get_logger
from tui.data.daily_store import DailyStore
from tui.data.reminders_store import RemindersStore
from tui.data.repository import QueryRepository
from tui.runtime import AppRuntime


def _main(stdscr: curses.window) -> None:
    query_service = QueryService(aggregate_source=MarkdownDailyAggregateSource())
    repo = QueryRepository(query_service)
    daily_store = DailyStore(note_store=MarkdownNoteStore())
    reminders_store = RemindersStore(rule_store=MarkdownReminderRuleStore())
    runtime = AppRuntime(
        stdscr=stdscr,
        repo=repo,
        daily_store=daily_store,
        reminders_store=reminders_store,
    )
    runtime.run()


def run() -> None:
    """Run interactive curses shell."""
    configure_logging()
    logger = get_logger(__name__)
    try:
        curses.wrapper(_main)
    except Exception:
        logger.exception("TUI app crashed")
        raise
