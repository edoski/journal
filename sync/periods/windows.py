"""Typed period window builders for period sync entrypoints."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.dates import (
    iso_week_range,
    month_range,
    month_week_ranges,
    shift_month,
    year_quarters,
    year_range,
)


@dataclass(frozen=True)
class WeekWindow:
    """Window metadata for a weekly sync run."""

    target_date: datetime.date
    current_date: datetime.date | None
    start: datetime.date
    end: datetime.date
    year: int
    week_num: int
    filename: str
    previous_start: datetime.date
    previous_end: datetime.date
    previous_filename: str
    previous_label: str

    def prior_bounds(self, weeks_ago: int) -> tuple[datetime.date, datetime.date]:
        """Return date bounds for a prior week offset."""
        start = self.start - datetime.timedelta(days=7 * weeks_ago)
        return start, start + datetime.timedelta(days=6)


@dataclass(frozen=True)
class MonthWindow:
    """Window metadata for a monthly sync run."""

    target_date: datetime.date
    current_date: datetime.date | None
    start: datetime.date
    end: datetime.date
    year: int
    month: int
    filename: str
    week_ranges: list[tuple[datetime.date, datetime.date]]
    previous_year: int
    previous_month: int
    previous_start: datetime.date
    previous_end: datetime.date
    previous_filename: str
    previous_label: str
    current_label: str

    def prior_bounds(self, months_ago: int) -> tuple[datetime.date, datetime.date]:
        """Return date bounds for a prior month offset."""
        prior_year, prior_month = shift_month(self.year, self.month, -months_ago)
        return month_range(prior_year, prior_month)


@dataclass(frozen=True)
class YearWindow:
    """Window metadata for a yearly sync run."""

    target_date: datetime.date
    year: int
    start: datetime.date
    end: datetime.date
    filename: str
    quarter_ranges: list[tuple[datetime.date, datetime.date]]
    previous_start: datetime.date
    previous_end: datetime.date
    previous_quarter_ranges: list[tuple[datetime.date, datetime.date]]

    def prior_bounds(self, years_ago: int) -> tuple[datetime.date, datetime.date]:
        """Return date bounds for a prior year offset."""
        return year_range(self.year - years_ago)


def build_week_window(
    target_date: datetime.date,
    *,
    current_date: datetime.date | None = None,
) -> WeekWindow:
    """Build week window metadata for a target date."""
    start, end = iso_week_range(target_date)
    year, week_num, _ = target_date.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"

    previous_start = start - datetime.timedelta(days=7)
    previous_end = end - datetime.timedelta(days=7)
    previous_year, previous_week_num, _ = previous_start.isocalendar()
    previous_filename = f"{previous_year}-W{previous_week_num:02d}.md"

    return WeekWindow(
        target_date=target_date,
        current_date=current_date,
        start=start,
        end=end,
        year=year,
        week_num=week_num,
        filename=filename,
        previous_start=previous_start,
        previous_end=previous_end,
        previous_filename=previous_filename,
        previous_label="PREVIOUS",
    )


def resolve_week_window(
    selected_date: datetime.date,
    *,
    execution_date: datetime.date,
) -> WeekWindow:
    """Resolve current and historical week anchors."""
    start, end = iso_week_range(selected_date)
    current_date = execution_date if start <= execution_date <= end else None
    target_date = execution_date if current_date is not None else end
    return build_week_window(target_date, current_date=current_date)


def build_month_window(
    target_date: datetime.date,
    *,
    current_date: datetime.date | None = None,
) -> MonthWindow:
    """Build month window metadata for a target date."""
    start, end = month_range(target_date.year, target_date.month)
    filename = f"{target_date.year}-{target_date.month:02d}.md"

    previous_year, previous_month = shift_month(target_date.year, target_date.month, -1)
    previous_start, previous_end = month_range(previous_year, previous_month)
    previous_filename = f"{previous_year}-{previous_month:02d}.md"

    return MonthWindow(
        target_date=target_date,
        current_date=current_date,
        start=start,
        end=end,
        year=target_date.year,
        month=target_date.month,
        filename=filename,
        week_ranges=month_week_ranges(target_date.year, target_date.month),
        previous_year=previous_year,
        previous_month=previous_month,
        previous_start=previous_start,
        previous_end=previous_end,
        previous_filename=previous_filename,
        previous_label="PREVIOUS",
        current_label="CURRENT",
    )


def resolve_month_window(
    year: int,
    month: int,
    *,
    execution_date: datetime.date,
) -> MonthWindow:
    """Resolve current and historical month anchors."""
    start, end = month_range(year, month)
    current_date = execution_date if start <= execution_date <= end else None
    target_date = execution_date if current_date is not None else end
    return build_month_window(target_date, current_date=current_date)


def build_year_window(year: int, *, target_date: datetime.date) -> YearWindow:
    """Build year window metadata."""
    start, end = year_range(year)
    previous_year = year - 1
    previous_start, previous_end = year_range(previous_year)

    return YearWindow(
        target_date=target_date,
        year=year,
        start=start,
        end=end,
        filename=f"{year}.md",
        quarter_ranges=year_quarters(year),
        previous_start=previous_start,
        previous_end=previous_end,
        previous_quarter_ranges=year_quarters(previous_year),
    )
