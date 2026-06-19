"""Runtime wiring and period sync runners."""

from __future__ import annotations

import datetime
from collections.abc import Callable
from dataclasses import dataclass

from sync.adapters.cache_bootstrap import bootstrap_cache_layout
from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_cache import JsonDailyTrainingCacheStore
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
from sync.application.daily_sync_service import DailySyncService
from sync.application.goal_sync_service import GoalSyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.dates import month_range, quarter_of_date
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)
from sync.ports.cache import (
    DailyTrainingCacheStore,
    GoalCarryForwardCacheStore,
    GoalReconcileCacheStore,
)
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.goals import GoalStore
from sync.ports.media import MediaSource
from sync.ports.notes import NoteStore
from sync.ports.reminders import ReminderRuleStore
from sync.ports.schedule import ScheduleSource
from sync.ports.sessions import StudySessionSource
from sync.ports.status import DailyStatusSource


@dataclass(frozen=True)
class WiringDeps:
    """Factories and runtime hooks used by the composition root."""

    bootstrap_cache_layout: Callable[[], None]
    session_source_factory: Callable[[], StudySessionSource]
    status_source_factory: Callable[[], DailyStatusSource]
    note_store_factory: Callable[[], NoteStore]
    training_cache_store_factory: Callable[[], DailyTrainingCacheStore]
    reminder_store_factory: Callable[[], ReminderRuleStore]
    goal_store_factory: Callable[[], GoalStore]
    carry_cache_store_factory: Callable[[], GoalCarryForwardCacheStore]
    reconcile_cache_store_factory: Callable[[], GoalReconcileCacheStore]
    aggregate_source_factory: Callable[[], DailyAggregateSource]
    media_source_factory: Callable[[], MediaSource]
    schedule_source_factory: Callable[[], ScheduleSource]


def default_wiring_deps() -> WiringDeps:
    """Return the default runtime wiring dependencies."""
    return WiringDeps(
        bootstrap_cache_layout=bootstrap_cache_layout,
        session_source_factory=FlowStudySessionSource,
        status_source_factory=ICloudDailyStatusSource,
        note_store_factory=MarkdownNoteStore,
        training_cache_store_factory=JsonDailyTrainingCacheStore,
        reminder_store_factory=MarkdownReminderRuleStore,
        goal_store_factory=MarkdownGoalStore,
        carry_cache_store_factory=JsonGoalCarryForwardCacheStore,
        reconcile_cache_store_factory=JsonGoalReconcileCacheStore,
        aggregate_source_factory=MarkdownDailyAggregateSource,
        media_source_factory=lambda: ObsidianMediaSource(
            media_cache_store=JsonMediaDateCacheStore()
        ),
        schedule_source_factory=MarkdownScheduleSource,
    )


def _build_goal_sync_service(
    note_store: NoteStore,
    *,
    deps: WiringDeps | None = None,
) -> GoalSyncService:
    resolved = deps or default_wiring_deps()
    goal_store = resolved.goal_store_factory()
    carry_cache_store = resolved.carry_cache_store_factory()
    reconcile_cache_store = resolved.reconcile_cache_store_factory()
    return GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=carry_cache_store,
        reconcile_cache_store=reconcile_cache_store,
    )


def _build_period_sync_service(*, deps: WiringDeps | None = None) -> PeriodSyncService:
    resolved = deps or default_wiring_deps()
    note_store = resolved.note_store_factory()
    return PeriodSyncService(
        note_store=note_store,
        aggregate_source=resolved.aggregate_source_factory(),
        media_source=resolved.media_source_factory(),
        goal_sync_service=_build_goal_sync_service(note_store, deps=resolved),
    )


def run_daily_sync(*, deps: WiringDeps | None = None) -> None:
    resolved = deps or default_wiring_deps()
    resolved.bootstrap_cache_layout()
    day = datetime.date.today()
    schedule_source = resolved.schedule_source_factory()
    session_source = resolved.session_source_factory()
    note_store = resolved.note_store_factory()
    training_cache_store = resolved.training_cache_store_factory()
    status_source = resolved.status_source_factory()
    service = DailySyncService(
        note_store=note_store,
        status_source=status_source,
        reminder_store=resolved.reminder_store_factory(),
        goal_sync_service=_build_goal_sync_service(note_store, deps=resolved),
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


def run_weekly_sync(
    *,
    date_arg: str | None,
    no_cleanup: bool,
    deps: WiringDeps | None = None,
) -> None:
    resolved = deps or default_wiring_deps()
    resolved.bootstrap_cache_layout()

    if date_arg:
        target_date = datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    window = build_week_window(target_date)
    note_path = resolve_note_path(window.filename)

    service = _build_period_sync_service(deps=resolved)
    cleanup_previous_runner: Callable[[], None] | None = None
    if not no_cleanup:
        previous_date = window.previous_start.isoformat()

        def run_previous_cleanup() -> None:
            run_weekly_sync(date_arg=previous_date, no_cleanup=True, deps=resolved)

        cleanup_previous_runner = run_previous_cleanup

    service.sync_week(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_previous_runner,
    )


def _resolve_month_target_date(
    month_arg: str | None,
    *,
    today: datetime.date,
) -> datetime.date:
    if month_arg is None:
        return today

    year, month = map(int, month_arg.split("-"))
    if year == today.year and month == today.month:
        return today
    _start, end = month_range(year, month)
    return end


def run_monthly_sync(
    *,
    month_arg: str | None,
    no_cleanup: bool,
    deps: WiringDeps | None = None,
) -> None:
    resolved = deps or default_wiring_deps()
    resolved.bootstrap_cache_layout()

    target_date = _resolve_month_target_date(
        month_arg,
        today=datetime.date.today(),
    )

    window = build_month_window(target_date)
    note_path = resolve_note_path(window.filename)

    service = _build_period_sync_service(deps=resolved)
    cleanup_previous_runner: Callable[[], None] | None = None
    if not no_cleanup:
        previous_month = f"{window.previous_year}-{window.previous_month:02d}"

        def run_previous_cleanup() -> None:
            run_monthly_sync(month_arg=previous_month, no_cleanup=True, deps=resolved)

        cleanup_previous_runner = run_previous_cleanup

    service.sync_month(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_previous_runner,
    )


def run_quarterly_sync(
    *,
    quarter_arg: str | None,
    deps: WiringDeps | None = None,
) -> None:
    resolved = deps or default_wiring_deps()
    resolved.bootstrap_cache_layout()

    if quarter_arg:
        parts = quarter_arg.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
        today = datetime.date.today()
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    window = build_quarter_window(year, quarter_num, target_date=today)
    note_path = resolve_note_path(window.filename)

    _build_period_sync_service(deps=resolved).sync_quarter(window, note_path)


def run_yearly_sync(
    *,
    year_arg: str | None,
    deps: WiringDeps | None = None,
) -> None:
    resolved = deps or default_wiring_deps()
    resolved.bootstrap_cache_layout()

    if year_arg:
        year = int(year_arg)
        today = datetime.date.today()
    else:
        today = datetime.date.today()
        year = today.year

    window = build_year_window(year, target_date=today)
    note_path = resolve_note_path(window.filename)

    _build_period_sync_service(deps=resolved).sync_year(window, note_path)
