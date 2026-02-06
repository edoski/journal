"""Query repository for period and metric exploration in the TUI."""

from __future__ import annotations

import datetime
import os
import re
from dataclasses import dataclass
from typing import Any

from sync.constants import JOURNAL_DIR
from sync.dates import (
    daterange,
    iso_week_range,
    month_range,
    quarter_of_date,
    quarter_range,
    shift_month,
    shift_quarter,
    year_range,
)
from sync.metrics import (
    aggregate_interrupt_overrun,
    aggregate_screen_time,
    compute_period_metrics,
    load_daily_data_for_dates,
)


@dataclass(frozen=True)
class PeriodSnapshot:
    """Aggregated metrics view for a date period."""

    period: str
    start: datetime.date
    end: datetime.date
    label: str
    metrics: dict[str, float | int | None]


class QueryRepository:
    """Read-only query facade over parsed daily notes and metric aggregators."""

    def list_daily_dates(self) -> list[datetime.date]:
        """List all daily note dates available in JOURNAL_DIR."""
        dates: list[datetime.date] = []
        if not os.path.isdir(JOURNAL_DIR):
            return dates

        for name in os.listdir(JOURNAL_DIR):
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
            start, end = iso_week_range(anchor_date)
            iso_year, iso_week, _ = start.isocalendar()
            return start, end, f"{iso_year}-W{iso_week:02d}"
        if period == "month":
            start, end = month_range(anchor_date.year, anchor_date.month)
            return start, end, f"{start.year}-{start.month:02d}"
        if period == "quarter":
            year, quarter_num = quarter_of_date(anchor_date)
            start, end = quarter_range(year, quarter_num)
            return start, end, f"{year}-Q{quarter_num}"
        if period == "year":
            start, end = year_range(anchor_date.year)
            return start, end, f"{start.year}"

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
            start, _ = quarter_range(new_year, new_quarter)
            return start
        if period == "year":
            new_year = anchor_date.year + delta
            return datetime.date(new_year, 1, 1)
        raise ValueError(f"Unsupported period: {period}")

    def query_by_period(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodSnapshot:
        """Return aggregated metrics keyed by metric ID for the selected period."""
        start, end, label = self.period_bounds(period, anchor_date)
        dates = list(daterange(start, end))
        daily_data = load_daily_data_for_dates(dates)

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
        """Return selected period snapshot and metric value for metric explorer."""
        snapshot = self.query_by_period(period, anchor_date)
        return snapshot, snapshot.metrics.get(metric)
