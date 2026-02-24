"""Port-driven service for weekly/monthly/quarterly/yearly sync."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from collections.abc import Callable

from sync.constants import (
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
)
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.dates import daterange
from sync.metrics import compute_period_metrics
from sync.periods.engine import (
    build_monthly_metrics,
    build_quarterly_metrics,
    build_weekly_metrics,
    build_yearly_metrics,
)
from sync.periods.runtime import (
    journal_path,
    maybe_cleanup_previous,
    open_period_note,
    write_note_metrics,
)
from sync.periods.windows import MonthWindow, QuarterWindow, WeekWindow, YearWindow
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.media import MediaSource
from sync.ports.notes import NoteStore
from sync.ports.schedule import ScheduleSource
from sync.log import get_logger
from sync.target_policy import study_target_minutes_for_dates

from .goal_sync_service import GoalSyncService

logger = get_logger(__name__)


@dataclass(frozen=True)
class PeriodSyncService:
    """Synchronize periodic notes through ports and shared engines."""

    note_store: NoteStore
    aggregate_source: DailyAggregateSource
    media_source: MediaSource
    schedule_source: ScheduleSource
    goal_sync_service: GoalSyncService

    def _load_range(
        self,
        start_date: datetime.date,
        end_date: datetime.date,
    ) -> dict[datetime.date, DailyAggregate]:
        dates = list(daterange(start_date, end_date))
        return self.aggregate_source.load_for_dates(dates)

    def _load_dates(
        self,
        dates: list[datetime.date],
    ) -> dict[datetime.date, DailyAggregate]:
        return self.aggregate_source.load_for_dates(dates)

    def _load_prior_metrics(
        self,
        offsets: range,
        bounds_for_offset: Callable[[int], tuple[datetime.date, datetime.date]],
    ) -> list[PeriodAggregate]:
        metrics_list: list[PeriodAggregate] = []
        for offset in offsets:
            start_date, end_date = bounds_for_offset(offset)
            dates = list(daterange(start_date, end_date))
            daily_data = self._load_dates(dates)
            metrics_list.append(compute_period_metrics(dates, daily_data))
        return metrics_list

    def _resolve_study_target_minutes(
        self,
        dates: list[datetime.date],
    ) -> int | None:
        if not dates:
            return None
        try:
            return study_target_minutes_for_dates(
                dates, self.schedule_source.resolve_day
            )
        except Exception as exc:
            logger.warning(
                "Study target unavailable for %s -> %s: %s",
                dates[0].isoformat(),
                dates[-1].isoformat(),
                exc,
            )
            return None

    def sync_week(
        self,
        window: WeekWindow,
        note_path: str,
        *,
        cleanup_previous: bool,
        cleanup_previous_runner: Callable[[], None] | None = None,
    ) -> None:
        with open_period_note(
            note_path, WEEKLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            week_dates = list(daterange(window.start, window.end))
            daily_data = self._load_dates(week_dates)

            prev_week_dates = list(
                daterange(window.previous_start, window.previous_end)
            )
            prev_daily_data = self._load_dates(prev_week_dates)

            prior_week_metrics = self._load_prior_metrics(
                range(4, 0, -1),
                window.prior_bounds,
            )
            media_bundle = self.media_source.scan(window.start, window.end)
            study_target_minutes = self._resolve_study_target_minutes(week_dates)

            metrics_block = build_weekly_metrics(
                window.start,
                window.end,
                daily_data,
                prev_daily_data,
                window.previous_label,
                media_bundle,
                study_target_minutes=study_target_minutes,
                prior_week_metrics=prior_week_metrics,
            )

            lines = self.goal_sync_service.sync_weekly_note(
                lines,
                note_path=note_path,
                window=window,
            )
            write_note_metrics(note_path, lines, metrics_block, self.note_store)

        maybe_cleanup_previous(
            enabled=cleanup_previous,
            previous_note_path=journal_path(window.previous_filename),
            rerun=cleanup_previous_runner,
        )

    def sync_month(
        self,
        window: MonthWindow,
        note_path: str,
        *,
        cleanup_previous: bool,
        cleanup_previous_runner: Callable[[], None] | None = None,
    ) -> None:
        with open_period_note(
            note_path, MONTHLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            month_start, month_end = window.start, window.end

            month_dates = list(daterange(month_start, month_end))
            daily_data = self._load_dates(month_dates)

            prev_month_dates = list(
                daterange(window.previous_start, window.previous_end)
            )
            prev_daily_data = self._load_dates(prev_month_dates)

            prior_month_metrics = self._load_prior_metrics(
                range(3, 0, -1),
                window.prior_bounds,
            )
            media_bundle = self.media_source.scan(month_start, month_end)
            study_target_minutes = self._resolve_study_target_minutes(month_dates)

            metrics_block = build_monthly_metrics(
                month_start,
                month_end,
                window.week_ranges,
                daily_data,
                prev_daily_data,
                window.current_label,
                window.previous_label,
                media_bundle,
                study_target_minutes=study_target_minutes,
                prior_month_metrics=prior_month_metrics,
            )

            lines = self.goal_sync_service.sync_monthly_note(
                lines,
                note_path=note_path,
                window=window,
            )
            write_note_metrics(note_path, lines, metrics_block, self.note_store)

        maybe_cleanup_previous(
            enabled=cleanup_previous,
            previous_note_path=journal_path(window.previous_filename),
            rerun=cleanup_previous_runner,
        )

    def sync_quarter(self, window: QuarterWindow, note_path: str) -> None:
        with open_period_note(
            note_path, QUARTERLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            quarter_dates = list(daterange(window.start, window.end))
            daily_data = self._load_dates(quarter_dates)
            prev_daily_data = self._load_range(
                window.previous_start, window.previous_end
            )
            prior_quarter_metrics = self._load_prior_metrics(
                range(4, 0, -1),
                window.prior_bounds,
            )
            media_bundle = self.media_source.scan(window.start, window.end)
            study_target_minutes = self._resolve_study_target_minutes(quarter_dates)

            metrics_block = build_quarterly_metrics(
                window.start,
                window.end,
                window.month_ranges,
                daily_data,
                prev_daily_data,
                window.previous_year,
                window.previous_quarter,
                media_bundle,
                study_target_minutes=study_target_minutes,
                prior_quarter_metrics=prior_quarter_metrics,
            )

            lines = self.goal_sync_service.sync_quarterly_note(
                lines,
                note_path=note_path,
                window=window,
            )
            write_note_metrics(note_path, lines, metrics_block, self.note_store)

    def sync_year(self, window: YearWindow, note_path: str) -> None:
        with open_period_note(
            note_path, YEARLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            year_dates = list(daterange(window.start, window.end))
            daily_data = self._load_dates(year_dates)
            prev_daily_data = self._load_range(
                window.previous_start, window.previous_end
            )
            prior_year_metrics = self._load_prior_metrics(
                range(3, 0, -1),
                window.prior_bounds,
            )
            media_bundle = self.media_source.scan(window.start, window.end)
            study_target_minutes = self._resolve_study_target_minutes(year_dates)

            metrics_block = build_yearly_metrics(
                window.year,
                window.start,
                window.end,
                window.quarter_ranges,
                window.previous_quarter_ranges,
                daily_data,
                prev_daily_data,
                media_bundle,
                study_target_minutes=study_target_minutes,
                prior_year_metrics=prior_year_metrics,
            )

            lines = self.goal_sync_service.sync_yearly_note(lines, window=window)
            write_note_metrics(note_path, lines, metrics_block, self.note_store)
