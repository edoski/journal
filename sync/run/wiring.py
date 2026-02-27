"""Runtime wiring and period sync runners."""

from __future__ import annotations

import datetime

from sync.adapters.cache_bootstrap import bootstrap_cache_layout
from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_cache import (
    JsonDailyScreenTimeCacheStore,
    JsonDailyTrainingCacheStore,
)
from sync.adapters.json_goal_cache import (
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
)
from sync.adapters.json_media_cache import JsonMediaDateCacheStore
from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.adapters.obsidian_media import ObsidianMediaSource
from sync.adapters.vault_context import VaultContextSource
from sync.application.daily_sync_service import DailySyncService
from sync.application.goal_sync_service import GoalSyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.dates import quarter_of_date
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)


def _build_goal_sync_service(note_store: MarkdownNoteStore) -> GoalSyncService:
    goal_store = MarkdownGoalStore()
    carry_cache_store = JsonGoalCarryForwardCacheStore()
    reconcile_cache_store = JsonGoalReconcileCacheStore()
    return GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=carry_cache_store,
        reconcile_cache_store=reconcile_cache_store,
    )


def _build_period_sync_service() -> PeriodSyncService:
    note_store = MarkdownNoteStore()
    media_cache_store = JsonMediaDateCacheStore()
    return PeriodSyncService(
        note_store=note_store,
        aggregate_source=MarkdownDailyAggregateSource(),
        media_source=ObsidianMediaSource(media_cache_store=media_cache_store),
        schedule_source=MarkdownScheduleSource(),
        goal_sync_service=_build_goal_sync_service(note_store),
    )


def run_daily_sync() -> None:
    bootstrap_cache_layout()
    day = datetime.date.today()
    schedule_source = MarkdownScheduleSource()
    session_source = FlowStudySessionSource()
    note_store = MarkdownNoteStore()
    training_cache_store = JsonDailyTrainingCacheStore()
    screen_time_cache_store = JsonDailyScreenTimeCacheStore()
    status_source = ICloudDailyStatusSource(
        screen_time_cache_store=screen_time_cache_store
    )
    service = DailySyncService(
        note_store=note_store,
        status_source=status_source,
        context_source=VaultContextSource(),
        reminder_store=MarkdownReminderRuleStore(),
        goal_sync_service=_build_goal_sync_service(note_store),
        training_cache_store=training_cache_store,
    )

    target_days = status_source.target_days(day)
    run_days = sorted(d for d in target_days if d != day)
    run_days.append(day)

    for run_day in run_days:
        day_schedule = schedule_source.resolve_day(run_day)
        sessions = session_source.load_sessions(run_day, day_schedule)
        changed = service.sync_day(run_day, sessions, day_schedule)
        if changed is False:
            continue


def run_weekly_sync(*, date_arg: str | None, no_cleanup: bool) -> None:
    bootstrap_cache_layout()

    if date_arg:
        target_date = datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    window = build_week_window(target_date)
    note_path = resolve_note_path(window.filename)

    service = _build_period_sync_service()
    cleanup_runner = None
    if not no_cleanup:
        previous_date = window.previous_start.isoformat()

        def cleanup_runner() -> None:
            run_weekly_sync(date_arg=previous_date, no_cleanup=True)

    service.sync_week(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_runner,
    )


def run_monthly_sync(*, month_arg: str | None, no_cleanup: bool) -> None:
    bootstrap_cache_layout()

    if month_arg:
        year, month = map(int, month_arg.split("-"))
        target_date = datetime.date(year, month, 1)
    else:
        today = datetime.date.today()
        target_date = datetime.date(today.year, today.month, 1)

    window = build_month_window(target_date)
    note_path = resolve_note_path(window.filename)

    service = _build_period_sync_service()
    cleanup_runner = None
    if not no_cleanup:
        previous_month = f"{window.previous_year}-{window.previous_month:02d}"

        def cleanup_runner() -> None:
            run_monthly_sync(month_arg=previous_month, no_cleanup=True)

    service.sync_month(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_runner,
    )


def run_quarterly_sync(*, quarter_arg: str | None) -> None:
    bootstrap_cache_layout()

    if quarter_arg:
        parts = quarter_arg.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    window = build_quarter_window(year, quarter_num)
    note_path = resolve_note_path(window.filename)

    _build_period_sync_service().sync_quarter(window, note_path)


def run_yearly_sync(*, year_arg: str | None) -> None:
    bootstrap_cache_layout()

    if year_arg:
        year = int(year_arg)
    else:
        year = datetime.date.today().year

    window = build_year_window(year)
    note_path = resolve_note_path(window.filename)

    _build_period_sync_service().sync_year(window, note_path)
