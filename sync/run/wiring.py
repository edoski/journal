"""Runtime wiring and period sync runners."""

from __future__ import annotations

import datetime
from collections.abc import Callable

from sync.adapters.storage_bootstrap import bootstrap_storage_layout
from sync.adapters.finance_store import FinanceStoreSource
from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_state import JsonDailyTrainingStateStore
from sync.adapters.json_media_cache import JsonMediaDateCacheStore
from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.adapters.obsidian_media import ObsidianMediaSource
from sync.application.daily_sync_service import DailySyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import journal_path
from sync.periods.windows import (
    build_year_window,
    resolve_month_window,
    resolve_week_window,
)


def _build_period_sync_service() -> PeriodSyncService:
    note_store = MarkdownNoteStore()
    return PeriodSyncService(
        note_store=note_store,
        aggregate_source=MarkdownDailyAggregateSource(),
        media_source=ObsidianMediaSource(
            media_cache_store=JsonMediaDateCacheStore(),
            note_store=note_store,
        ),
        finance_source=FinanceStoreSource(),
    )


def run_daily_sync() -> None:
    bootstrap_storage_layout()
    day = datetime.date.today()
    schedule_source = MarkdownScheduleSource()
    session_source = FlowStudySessionSource()
    note_store = MarkdownNoteStore()
    training_state_store = JsonDailyTrainingStateStore()
    status_source = ICloudDailyStatusSource()
    service = DailySyncService(
        note_store=note_store,
        status_source=status_source,
        training_state_store=training_state_store,
    )

    target_days = status_source.target_days(day)
    run_days = sorted(d for d in target_days if d != day)
    run_days.append(day)

    for run_day in run_days:
        day_schedule = schedule_source.resolve_day(run_day)
        sessions = session_source.load_sessions(run_day, day_schedule)
        service.sync_day(run_day, sessions)


def run_weekly_sync(
    *,
    date_arg: str | None,
    no_cleanup: bool,
) -> None:
    bootstrap_storage_layout()

    today = datetime.date.today()
    if date_arg:
        target_date = datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()
    else:
        target_date = today

    window = resolve_week_window(target_date, execution_date=today)
    note_path = journal_path(window.filename)

    service = _build_period_sync_service()
    cleanup_previous_runner: Callable[[], None] | None = None
    if not no_cleanup:
        previous_date = window.previous_start.isoformat()

        def run_previous_cleanup() -> None:
            run_weekly_sync(date_arg=previous_date, no_cleanup=True)

        cleanup_previous_runner = run_previous_cleanup

    service.sync_week(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_previous_runner,
    )


def run_monthly_sync(
    *,
    month_arg: str | None,
    no_cleanup: bool,
) -> None:
    bootstrap_storage_layout()

    today = datetime.date.today()
    year, month = (
        map(int, month_arg.split("-"))
        if month_arg is not None
        else (today.year, today.month)
    )
    window = resolve_month_window(year, month, execution_date=today)
    note_path = journal_path(window.filename)

    service = _build_period_sync_service()
    cleanup_previous_runner: Callable[[], None] | None = None
    if not no_cleanup:
        previous_month = f"{window.previous_year}-{window.previous_month:02d}"

        def run_previous_cleanup() -> None:
            run_monthly_sync(month_arg=previous_month, no_cleanup=True)

        cleanup_previous_runner = run_previous_cleanup

    service.sync_month(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_previous_runner,
    )


def run_yearly_sync(
    *,
    year_arg: str | None,
) -> None:
    bootstrap_storage_layout()

    today = datetime.date.today()
    year = int(year_arg) if year_arg else today.year

    window = build_year_window(year, target_date=today)
    note_path = journal_path(window.filename)

    _build_period_sync_service().sync_year(window, note_path)
