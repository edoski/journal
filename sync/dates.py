"""
Date range calculations for the journal sync system.

Provides utilities for computing date ranges for weeks, months,
quarters, and years.
"""

from __future__ import annotations

import datetime
from collections import OrderedDict

from .constants import MONTH_ABBR


def daterange(start_date: datetime.date, end_date: datetime.date):
    """Yield dates from start_date to end_date (inclusive)."""
    current = start_date
    while current <= end_date:
        yield current
        current += datetime.timedelta(days=1)


def iso_week_range(date_obj: datetime.date) -> tuple[datetime.date, datetime.date]:
    """Return (Monday, Sunday) for the ISO week containing date_obj."""
    start = date_obj - datetime.timedelta(days=date_obj.isoweekday() - 1)
    end = start + datetime.timedelta(days=6)
    return start, end


def month_range(year: int, month: int) -> tuple[datetime.date, datetime.date]:
    """Return (first_day, last_day) for the given month."""
    start = datetime.date(year, month, 1)
    if month == 12:
        end = datetime.date(year + 1, 1, 1) - datetime.timedelta(days=1)
    else:
        end = datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)
    return start, end


def quarter_range(year: int, quarter: int) -> tuple[datetime.date, datetime.date]:
    """
    Return (start_date, end_date) for a given quarter number (1-4).
    """
    if quarter < 1 or quarter > 4:
        raise ValueError("quarter must be in 1..4")
    start_month = 3 * (quarter - 1) + 1
    start = datetime.date(year, start_month, 1)
    end_month = start_month + 2
    _, end = month_range(year, end_month)
    return start, end


def quarter_months(
    year: int, quarter: int
) -> list[tuple[datetime.date, datetime.date]]:
    """
    Return a list of (month_start, month_end) tuples for the quarter.
    """
    start_month = 3 * (quarter - 1) + 1
    months = []
    for m in range(start_month, start_month + 3):
        months.append(month_range(year, m))
    return months


def quarter_of_date(date_obj: datetime.date) -> tuple[int, int]:
    """Return (year, quarter_number) for a given date."""
    q = (date_obj.month - 1) // 3 + 1
    return date_obj.year, q


def year_range(year: int) -> tuple[datetime.date, datetime.date]:
    """Return (start_date, end_date) for a calendar year."""
    start = datetime.date(year, 1, 1)
    end = datetime.date(year, 12, 31)
    return start, end


def year_quarters(year: int) -> list[tuple[datetime.date, datetime.date]]:
    """Return list of (start, end) tuples for all four quarters of a year."""
    ranges = []
    for q in range(1, 5):
        ranges.append(quarter_range(year, q))
    return ranges


def month_week_ranges(
    year: int, month: int
) -> list[tuple[datetime.date, datetime.date]]:
    """Return list of (week_start, week_end) tuples clipped to month boundaries."""
    month_start, month_end = month_range(year, month)
    weeks = OrderedDict()
    for day in daterange(month_start, month_end):
        week_start, week_end = iso_week_range(day)
        key = week_start
        if key not in weeks:
            weeks[key] = (week_start, week_end)
    ranges = []
    for week_start, week_end in weeks.values():
        start = max(week_start, month_start)
        end = min(week_end, month_end)
        ranges.append((start, end))
    return ranges


def format_week_label(start_date: datetime.date, end_date: datetime.date) -> str:
    """Format week range as 'MON DD-DD'."""
    month = MONTH_ABBR[start_date.month - 1]
    return f"{month} {start_date.day:02d}-{end_date.day:02d}"


def quarter_id(year: int, quarter_num: int) -> str:
    """Return quarter identifier like '2025-Q4'."""
    return f"{year}-Q{quarter_num}"
