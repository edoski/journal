"""
Tests for sync.dates module.

Covers date range calculations for weeks, months, quarters, and years.
"""

from __future__ import annotations

import datetime
import pytest

from sync.dates import (
    daterange,
    iso_week_range,
    month_range,
    shift_month,
    previous_month,
    quarter_range,
    year_range,
    year_quarters,
    month_week_ranges,
    format_week_label,
)


class TestDaterange:
    """Tests for daterange generator function."""

    def test_single_day(self):
        start = datetime.date(2025, 12, 25)
        result = list(daterange(start, start))
        assert result == [start]

    def test_multi_day(self):
        start = datetime.date(2025, 12, 23)
        end = datetime.date(2025, 12, 26)
        result = list(daterange(start, end))
        assert len(result) == 4
        assert result[0] == start
        assert result[-1] == end

    def test_week_range(self):
        start = datetime.date(2025, 12, 22)  # Monday
        end = datetime.date(2025, 12, 28)  # Sunday
        result = list(daterange(start, end))
        assert len(result) == 7

    def test_inclusive(self):
        """Verify both start and end dates are included."""
        start = datetime.date(2025, 1, 1)
        end = datetime.date(2025, 1, 3)
        result = list(daterange(start, end))
        assert start in result
        assert end in result


class TestIsoWeekRange:
    """Tests for iso_week_range function."""

    def test_monday(self):
        monday = datetime.date(2025, 12, 22)
        start, end = iso_week_range(monday)
        assert start == monday
        assert end == datetime.date(2025, 12, 28)

    def test_sunday(self):
        sunday = datetime.date(2025, 12, 28)
        start, end = iso_week_range(sunday)
        assert start == datetime.date(2025, 12, 22)
        assert end == sunday

    def test_mid_week(self):
        wednesday = datetime.date(2025, 12, 24)
        start, end = iso_week_range(wednesday)
        assert start == datetime.date(2025, 12, 22)
        assert end == datetime.date(2025, 12, 28)
        assert start.isoweekday() == 1  # Monday
        assert end.isoweekday() == 7  # Sunday

    def test_year_boundary(self):
        # Week spanning year boundary
        wed_dec31 = datetime.date(2024, 12, 31)
        start, end = iso_week_range(wed_dec31)
        assert start == datetime.date(2024, 12, 30)
        assert end == datetime.date(2025, 1, 5)


class TestMonthRange:
    """Tests for month_range function."""

    def test_standard_month(self):
        start, end = month_range(2025, 6)
        assert start == datetime.date(2025, 6, 1)
        assert end == datetime.date(2025, 6, 30)

    def test_31_day_month(self):
        start, end = month_range(2025, 12)
        assert start == datetime.date(2025, 12, 1)
        assert end == datetime.date(2025, 12, 31)

    def test_february_non_leap(self):
        start, end = month_range(2025, 2)
        assert start == datetime.date(2025, 2, 1)
        assert end == datetime.date(2025, 2, 28)

    def test_february_leap_year(self):
        start, end = month_range(2024, 2)
        assert start == datetime.date(2024, 2, 1)
        assert end == datetime.date(2024, 2, 29)

    def test_december_year_boundary(self):
        start, end = month_range(2025, 12)
        assert start == datetime.date(2025, 12, 1)
        assert end == datetime.date(2025, 12, 31)


class TestShiftMonth:
    """Tests for month shifting helpers."""

    def test_shift_month_backward(self):
        assert shift_month(2025, 1, -1) == (2024, 12)

    def test_shift_month_forward(self):
        assert shift_month(2025, 11, 3) == (2026, 2)

    def test_previous_month(self):
        assert previous_month(2025, 1) == (2024, 12)
        assert previous_month(2025, 8) == (2025, 7)


class TestQuarterRange:
    """Tests for quarter_range function."""

    def test_q1(self):
        start, end = quarter_range(2025, 1)
        assert start == datetime.date(2025, 1, 1)
        assert end == datetime.date(2025, 3, 31)

    def test_q2(self):
        start, end = quarter_range(2025, 2)
        assert start == datetime.date(2025, 4, 1)
        assert end == datetime.date(2025, 6, 30)

    def test_q3(self):
        start, end = quarter_range(2025, 3)
        assert start == datetime.date(2025, 7, 1)
        assert end == datetime.date(2025, 9, 30)

    def test_q4(self):
        start, end = quarter_range(2025, 4)
        assert start == datetime.date(2025, 10, 1)
        assert end == datetime.date(2025, 12, 31)

    def test_invalid_quarter_low(self):
        with pytest.raises(ValueError):
            quarter_range(2025, 0)

    def test_invalid_quarter_high(self):
        with pytest.raises(ValueError):
            quarter_range(2025, 5)


class TestYearRange:
    """Tests for year_range function."""

    def test_standard_year(self):
        start, end = year_range(2025)
        assert start == datetime.date(2025, 1, 1)
        assert end == datetime.date(2025, 12, 31)

    def test_leap_year(self):
        start, end = year_range(2024)
        assert start == datetime.date(2024, 1, 1)
        assert end == datetime.date(2024, 12, 31)


class TestYearQuarters:
    """Tests for year_quarters function."""

    def test_returns_four_quarters(self):
        quarters = year_quarters(2025)
        assert len(quarters) == 4

    def test_quarter_order(self):
        quarters = year_quarters(2025)
        assert quarters[0] == (datetime.date(2025, 1, 1), datetime.date(2025, 3, 31))
        assert quarters[1] == (datetime.date(2025, 4, 1), datetime.date(2025, 6, 30))
        assert quarters[2] == (datetime.date(2025, 7, 1), datetime.date(2025, 9, 30))
        assert quarters[3] == (datetime.date(2025, 10, 1), datetime.date(2025, 12, 31))


class TestMonthWeekRanges:
    """Tests for month_week_ranges function."""

    def test_month_with_full_weeks(self):
        # December 2025 starts on Monday
        weeks = month_week_ranges(2025, 12)
        assert len(weeks) == 5  # Dec 2025 has 5 week ranges

    def test_week_clipping_start(self):
        # First week should start at month start
        weeks = month_week_ranges(2025, 12)
        assert weeks[0][0] == datetime.date(2025, 12, 1)

    def test_week_clipping_end(self):
        # Last week should end at month end
        weeks = month_week_ranges(2025, 12)
        assert weeks[-1][1] == datetime.date(2025, 12, 31)

    def test_partial_first_week(self):
        # November 2025 starts on Saturday
        weeks = month_week_ranges(2025, 11)
        # First week range clipped to month start
        assert weeks[0][0] == datetime.date(2025, 11, 1)


class TestFormatWeekLabel:
    """Tests for format_week_label function."""

    def test_same_month(self):
        start = datetime.date(2025, 12, 1)
        end = datetime.date(2025, 12, 7)
        assert format_week_label(start, end) == "DEC 01-07"

    def test_leading_zeros(self):
        start = datetime.date(2025, 6, 2)
        end = datetime.date(2025, 6, 8)
        assert format_week_label(start, end) == "JUN 02-08"
