"""Period navigation helpers for query workflows."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.dates import quarter_of_date, shift_month, shift_quarter
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)


@dataclass(frozen=True)
class PeriodNavigator:
    """Resolve period bounds and anchor shifts for query views."""

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]:
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
            return build_year_window(anchor_date.year + delta).start
        raise ValueError(f"Unsupported period: {period}")
