"""Typed period window builders for period sync entrypoints."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.dates import (
    iso_week_range,
    month_range,
    month_week_ranges,
    previous_quarter as previous_quarter_value,
    quarter_months,
    quarter_range,
    shift_month,
    shift_quarter,
    year_quarters,
    year_range,
)


@dataclass(frozen=True)
class WeekWindow:
    """Window metadata for a weekly sync run."""

    target_date: datetime.date
    start: datetime.date
    end: datetime.date
    year: int
    week_num: int
    filename: str
    previous_start: datetime.date
    previous_end: datetime.date
    previous_year: int
    previous_week_num: int
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
class QuarterWindow:
    """Window metadata for a quarterly sync run."""

    year: int
    quarter: int
    start: datetime.date
    end: datetime.date
    filename: str
    month_ranges: list[tuple[datetime.date, datetime.date]]
    previous_year: int
    previous_quarter: int
    previous_start: datetime.date
    previous_end: datetime.date
    previous_filename: str

    def prior_bounds(self, quarters_ago: int) -> tuple[datetime.date, datetime.date]:
        """Return date bounds for a prior quarter offset."""
        prior_year, prior_quarter = shift_quarter(
            self.year, self.quarter, -quarters_ago
        )
        return quarter_range(prior_year, prior_quarter)


@dataclass(frozen=True)
class YearWindow:
    """Window metadata for a yearly sync run."""

    year: int
    start: datetime.date
    end: datetime.date
    filename: str
    quarter_ranges: list[tuple[datetime.date, datetime.date]]
    previous_year: int
    previous_start: datetime.date
    previous_end: datetime.date
    previous_filename: str
    previous_quarter_ranges: list[tuple[datetime.date, datetime.date]]

    def prior_bounds(self, years_ago: int) -> tuple[datetime.date, datetime.date]:
        """Return date bounds for a prior year offset."""
        return year_range(self.year - years_ago)


def build_week_window(target_date: datetime.date) -> WeekWindow:
    """Build week window metadata for a target date."""
    start, end = iso_week_range(target_date)
    year, week_num, _ = target_date.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"

    previous_start = start - datetime.timedelta(days=7)
    previous_end = end - datetime.timedelta(days=7)
    previous_year, previous_week_num, _ = previous_start.isocalendar()
    previous_filename = f"{previous_year}-W{previous_week_num:02d}.md"
    previous_label = f"**[[{previous_year}-W{previous_week_num:02d}\\|LAST WEEK]]**"

    return WeekWindow(
        target_date=target_date,
        start=start,
        end=end,
        year=year,
        week_num=week_num,
        filename=filename,
        previous_start=previous_start,
        previous_end=previous_end,
        previous_year=previous_year,
        previous_week_num=previous_week_num,
        previous_filename=previous_filename,
        previous_label=previous_label,
    )


def build_month_window(target_date: datetime.date) -> MonthWindow:
    """Build month window metadata for a target date."""
    start, end = month_range(target_date.year, target_date.month)
    filename = f"{target_date.year}-{target_date.month:02d}.md"

    previous_year, previous_month = shift_month(target_date.year, target_date.month, -1)
    previous_start, previous_end = month_range(previous_year, previous_month)
    previous_filename = f"{previous_year}-{previous_month:02d}.md"

    return MonthWindow(
        target_date=target_date,
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
        previous_label=f"**[[{previous_year}-{previous_month:02d}\\|LAST MONTH]]**",
        current_label="THIS MONTH",
    )


def build_quarter_window(year: int, quarter: int) -> QuarterWindow:
    """Build quarter window metadata."""
    start, end = quarter_range(year, quarter)
    filename = f"{year}-Q{quarter}.md"

    previous_year, previous_quarter_num = previous_quarter_value(year, quarter)
    previous_start, previous_end = quarter_range(previous_year, previous_quarter_num)
    previous_filename = f"{previous_year}-Q{previous_quarter_num}.md"

    return QuarterWindow(
        year=year,
        quarter=quarter,
        start=start,
        end=end,
        filename=filename,
        month_ranges=quarter_months(year, quarter),
        previous_year=previous_year,
        previous_quarter=previous_quarter_num,
        previous_start=previous_start,
        previous_end=previous_end,
        previous_filename=previous_filename,
    )


def build_year_window(year: int) -> YearWindow:
    """Build year window metadata."""
    start, end = year_range(year)
    previous_year = year - 1
    previous_start, previous_end = year_range(previous_year)

    return YearWindow(
        year=year,
        start=start,
        end=end,
        filename=f"{year}.md",
        quarter_ranges=year_quarters(year),
        previous_year=previous_year,
        previous_start=previous_start,
        previous_end=previous_end,
        previous_filename=f"{previous_year}.md",
        previous_quarter_ranges=year_quarters(previous_year),
    )
