"""Read-only query service for period/metric exploration."""

from __future__ import annotations

import datetime
import os
import re
from dataclasses import dataclass
from typing import Any, cast

from sync.constants import JOURNAL_DIR
from sync.dates import (
    daterange,
    quarter_of_date,
    shift_month,
    shift_quarter,
)
from sync.metrics import (
    aggregate_interrupt_overrun,
    aggregate_screen_time,
    compute_period_metrics,
)
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)
from sync.ports.daily_aggregates import DailyAggregateSource


@dataclass(frozen=True)
class PeriodSnapshot:
    """Aggregated metrics view for a date period."""

    period: str
    start: datetime.date
    end: datetime.date
    label: str
    metrics: dict[str, float | int | None]


class QueryService:
    """Read-only query facade over parsed daily-note aggregates."""

    def __init__(
        self,
        *,
        aggregate_source: DailyAggregateSource,
        journal_dir: str = JOURNAL_DIR,
    ) -> None:
        self.aggregate_source = aggregate_source
        self.journal_dir = journal_dir

    def list_daily_dates(self) -> list[datetime.date]:
        """List all daily note dates available in journal directory."""
        dates: list[datetime.date] = []
        if not os.path.isdir(self.journal_dir):
            return dates

        for name in os.listdir(self.journal_dir):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.md", name):
                continue
            try:
                dates.append(datetime.date.fromisoformat(name[:-3]))
            except ValueError:
                continue

        dates.sort()
        return dates

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]:
        """Resolve start/end/label for the given period key."""
        if period == "day":
            return anchor_date, anchor_date, anchor_date.isoformat()
        if period == "week":
            week_window = build_week_window(anchor_date)
            return (
                week_window.start,
                week_window.end,
                f"{week_window.year}-W{week_window.week_num:02d}",
            )
        if period == "month":
            month_start = datetime.date(anchor_date.year, anchor_date.month, 1)
            month_window = build_month_window(month_start)
            return (
                month_window.start,
                month_window.end,
                f"{month_window.year}-{month_window.month:02d}",
            )
        if period == "quarter":
            year, quarter_num = quarter_of_date(anchor_date)
            quarter_window = build_quarter_window(year, quarter_num)
            return (
                quarter_window.start,
                quarter_window.end,
                f"{quarter_window.year}-Q{quarter_window.quarter}",
            )
        if period == "year":
            year_window = build_year_window(anchor_date.year)
            return year_window.start, year_window.end, f"{year_window.year}"

        raise ValueError(f"Unsupported period: {period}")

    def shift_anchor(
        self,
        period: str,
        anchor_date: datetime.date,
        delta: int,
    ) -> datetime.date:
        """Shift anchor by N units of the selected period."""
        if period == "day":
            return anchor_date + datetime.timedelta(days=delta)
        if period == "week":
            return anchor_date + datetime.timedelta(days=delta * 7)
        if period == "month":
            year, month = shift_month(anchor_date.year, anchor_date.month, delta)
            return datetime.date(year, month, 1)
        if period == "quarter":
            year, quarter_num = quarter_of_date(anchor_date)
            new_year, new_quarter = shift_quarter(year, quarter_num, delta)
            return build_quarter_window(new_year, new_quarter).start
        if period == "year":
            new_year = anchor_date.year + delta
            return build_year_window(new_year).start
        raise ValueError(f"Unsupported period: {period}")

    def query_by_period(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodSnapshot:
        """Return aggregated metrics keyed by metric ID for selected period."""
        start, end, label = self.period_bounds(period, anchor_date)
        dates = list(daterange(start, end))
        daily_data = cast(
            dict[datetime.date, dict[str, Any]],
            self.aggregate_source.load_for_dates(dates),
        )

        period_metrics = compute_period_metrics(dates, daily_data)
        interrupt_total, overrun_total, _ = aggregate_interrupt_overrun(
            dates, daily_data
        )
        screen_time_total = sum(aggregate_screen_time(dates, daily_data).values())

        training_sessions_total = 0
        for payload in daily_data.values():
            sessions_map = payload.get("training_type_sessions", {})
            if isinstance(sessions_map, dict):
                training_sessions_total += sum(
                    int(v or 0) for v in sessions_map.values()
                )

        metrics: dict[str, float | int | None] = {
            "study_minutes": period_metrics.get("study_total_minutes"),
            "sleep_minutes": period_metrics.get("sleep_avg_minutes"),
            "mood": period_metrics.get("mood_avg"),
            "workout_count": period_metrics.get("workout_count"),
            "stretch_count": period_metrics.get("stretch_count"),
            "mindful_count": period_metrics.get("mindful_count"),
            "interrupt_minutes": interrupt_total,
            "overrun_minutes": overrun_total,
            "screen_time_total": screen_time_total,
            "training_sessions_total": training_sessions_total,
            "days_total": period_metrics.get("total_days"),
            "days_elapsed": period_metrics.get("days_up_to_today"),
        }

        return PeriodSnapshot(
            period=period,
            start=start,
            end=end,
            label=label,
            metrics=metrics,
        )

    def query_by_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[PeriodSnapshot, Any]:
        """Return selected period snapshot and metric value."""
        snapshot = self.query_by_period(period, anchor_date)
        return snapshot, snapshot.metrics.get(metric)
