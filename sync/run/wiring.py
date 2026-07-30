"""Runtime wiring and period sync runners."""

from __future__ import annotations

import datetime
from collections.abc import Callable
from dataclasses import dataclass

from sync.adapters.cache_bootstrap import bootstrap_cache_layout
from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_cache import JsonDailyTrainingCacheStore
from sync.adapters.json_media_cache import JsonMediaDateCacheStore
from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.adapters.obsidian_media import ObsidianMediaSource
from sync.application.daily_sync_service import DailySyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import (
    build_year_window,
    resolve_month_window,
    resolve_week_window,
)
from sync.ports.cache import (
    DailyTrainingCacheStore,
)
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.media import MediaSource
from sync.ports.notes import NoteStore
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
        aggregate_source_factory=MarkdownDailyAggregateSource,
        media_source_factory=lambda: ObsidianMediaSource(
            media_cache_store=JsonMediaDateCacheStore()
        ),
        schedule_source_factory=MarkdownScheduleSource,
    )


def _build_period_sync_service(*, deps: WiringDeps | None = None) -> PeriodSyncService:
    resolved = deps or default_wiring_deps()
    note_store = resolved.note_store_factory()
    return PeriodSyncService(
        note_store=note_store,
        aggregate_source=resolved.aggregate_source_factory(),
        media_source=resolved.media_source_factory(),
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

    today = datetime.date.today()
    if date_arg:
        target_date = datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()
    else:
        target_date = today

    window = resolve_week_window(target_date, execution_date=today)
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


def run_monthly_sync(
    *,
    month_arg: str | None,
    no_cleanup: bool,
    deps: WiringDeps | None = None,
) -> None:
    resolved = deps or default_wiring_deps()
    resolved.bootstrap_cache_layout()

    today = datetime.date.today()
    year, month = (
        map(int, month_arg.split("-"))
        if month_arg is not None
        else (today.year, today.month)
    )
    window = resolve_month_window(year, month, execution_date=today)
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
