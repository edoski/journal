"""Port-driven service for weekly/monthly/yearly sync."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from collections.abc import Callable

from sync.constants import (
    MONTHLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
)
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.dates import daterange
from sync.metrics import compute_period_metrics
from sync.periods.builders import (
    build_monthly_metrics,
    build_weekly_metrics,
    build_yearly_metrics,
)
from sync.periods.runtime import (
    journal_path,
    maybe_cleanup_previous,
    open_period_note,
    write_note_metrics,
)
from sync.periods.windows import MonthWindow, WeekWindow, YearWindow
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.media import MediaSource
from sync.ports.notes import NoteStore


@dataclass(frozen=True)
class PeriodSyncService:
    """Synchronize periodic notes through ports and shared engines."""

    note_store: NoteStore
    aggregate_source: DailyAggregateSource
    media_source: MediaSource

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

            metrics_block = build_weekly_metrics(
                window,
                daily_data,
                prev_daily_data,
                media_bundle,
                prior_week_metrics=prior_week_metrics,
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

            metrics_block = build_monthly_metrics(
                window,
                daily_data,
                prev_daily_data,
                media_bundle,
                prior_month_metrics=prior_month_metrics,
            )

            write_note_metrics(note_path, lines, metrics_block, self.note_store)

        maybe_cleanup_previous(
            enabled=cleanup_previous,
            previous_note_path=journal_path(window.previous_filename),
            rerun=cleanup_previous_runner,
        )

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

            metrics_block = build_yearly_metrics(
                window,
                daily_data,
                prev_daily_data,
                media_bundle,
                prior_year_metrics=prior_year_metrics,
            )

            write_note_metrics(note_path, lines, metrics_block, self.note_store)
