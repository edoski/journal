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
from sync.contracts.finance import FinanceBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.dates import daterange, month_range
from sync.metrics import compute_period_metrics
from sync.periods.builders import (
    build_monthly_metrics,
    build_weekly_metrics,
    build_yearly_metrics,
)
from sync.periods.finances import (
    month_entries,
    months_between,
    transactions_note_lines,
)
from sync.periods.runtime import (
    journal_path,
    maybe_cleanup_previous,
    publish_note_metrics,
    publish_whole_note,
    transactions_note_path,
)
from sync.log import get_logger
from sync.periods.windows import MonthWindow, WeekWindow, YearWindow
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.finance import FinanceSource, FinanceUnavailableError
from sync.ports.media import MediaSource
from sync.ports.notes import NoteStore


logger = get_logger(__name__)
_warned_unreadable = False


@dataclass(frozen=True)
class PeriodSyncService:
    """Synchronize periodic notes through ports and shared engines."""

    note_store: NoteStore
    aggregate_source: DailyAggregateSource
    media_source: MediaSource
    finance_source: FinanceSource

    def _load_finance(
        self, start: datetime.date, end: datetime.date
    ) -> FinanceBundle | None:
        """Bank data for the window; an unreadable store or rules file becomes a
        bundle carrying the reason, so one bad file never stops the other notes."""
        global _warned_unreadable
        try:
            return self.finance_source.load(start, end)
        except FinanceUnavailableError as exc:
            if not _warned_unreadable:
                _warned_unreadable = True
                logger.warning("finance data unreadable: %s", exc)
            return FinanceBundle(entries=(), covered_from=None, error=str(exc))

    def _publish_transactions(
        self, bundle: FinanceBundle | None, months: list[tuple[int, int]]
    ) -> None:
        """Write the transactions note of each month that has entries."""
        if bundle is None or bundle.error is not None:
            return
        for year, month in months:
            entries = month_entries(bundle, year, month)
            if entries:
                publish_whole_note(
                    transactions_note_path(year, month),
                    transactions_note_lines(year, month, entries),
                    self.note_store,
                )

    def _load_period_data(
        self,
        window: WeekWindow | MonthWindow | YearWindow,
        prior_count: int,
    ) -> tuple[
        dict[datetime.date, DailyAggregate],
        dict[datetime.date, DailyAggregate],
        list[PeriodAggregate],
    ]:
        current_dates = list(daterange(window.start, window.end))
        prior_dates = [
            list(daterange(*window.prior_bounds(offset)))
            for offset in range(prior_count, 0, -1)
        ]
        all_dates = sorted(set(current_dates).union(*prior_dates))
        daily_data = self.aggregate_source.load_for_dates(all_dates)
        current = {day: daily_data[day] for day in current_dates if day in daily_data}
        previous = {
            day: daily_data[day] for day in prior_dates[-1] if day in daily_data
        }
        prior_metrics = [
            compute_period_metrics(dates, daily_data) for dates in prior_dates
        ]
        return current, previous, prior_metrics

    def sync_week(
        self,
        window: WeekWindow,
        note_path: str,
        *,
        cleanup_previous: bool,
        cleanup_previous_runner: Callable[[], None] | None = None,
    ) -> None:
        daily_data, prev_daily_data, prior_week_metrics = self._load_period_data(
            window, 4
        )
        media_bundle = self.media_source.scan(window.start, window.end)
        # Whole months, so each linked month's transaction count is complete.
        finance = self._load_finance(
            min(
                window.prior_bounds(4)[0],
                month_range(window.start.year, window.start.month)[0],
            ),
            month_range(window.end.year, window.end.month)[1],
        )

        metrics_block = build_weekly_metrics(
            window,
            daily_data,
            prev_daily_data,
            media_bundle,
            prior_week_metrics=prior_week_metrics,
            finance=finance,
        )

        publish_note_metrics(
            note_path,
            WEEKLY_TEMPLATE_PATH,
            metrics_block,
            self.note_store,
        )
        self._publish_transactions(finance, months_between(window.start, window.end))

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
        daily_data, prev_daily_data, prior_month_metrics = self._load_period_data(
            window, 3
        )
        media_bundle = self.media_source.scan(window.start, window.end)
        finance = self._load_finance(window.prior_bounds(3)[0], window.end)

        metrics_block = build_monthly_metrics(
            window,
            daily_data,
            prev_daily_data,
            media_bundle,
            prior_month_metrics=prior_month_metrics,
            finance=finance,
        )

        publish_note_metrics(
            note_path,
            MONTHLY_TEMPLATE_PATH,
            metrics_block,
            self.note_store,
        )
        self._publish_transactions(finance, [(window.year, window.month)])

        maybe_cleanup_previous(
            enabled=cleanup_previous,
            previous_note_path=journal_path(window.previous_filename),
            rerun=cleanup_previous_runner,
        )

    def sync_year(self, window: YearWindow, note_path: str) -> None:
        daily_data, prev_daily_data, prior_year_metrics = self._load_period_data(
            window, 3
        )
        media_bundle = self.media_source.scan(window.start, window.end)
        finance = self._load_finance(window.prior_bounds(3)[0], window.end)

        metrics_block = build_yearly_metrics(
            window,
            daily_data,
            prev_daily_data,
            media_bundle,
            prior_year_metrics=prior_year_metrics,
            finance=finance,
        )

        publish_note_metrics(
            note_path,
            YEARLY_TEMPLATE_PATH,
            metrics_block,
            self.note_store,
        )
        self._publish_transactions(finance, months_between(window.start, window.end))
