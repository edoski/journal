"""Characterization tests for period metric block builders."""

from __future__ import annotations

import datetime

import sync.periods.builders as period_builders
from sync.contracts.media import MediaBundle
from sync.dates import (
    daterange,
    iso_week_range,
    month_range,
    month_week_ranges,
    quarter_months,
    quarter_range,
    year_quarters,
    year_range,
)
from sync.metrics import compute_period_metrics
from tests.support.period_fixture_data import FIXTURE_MEDIA_BUNDLE, range_data


def _section_headers(lines: list[str]) -> list[str]:
    return [line for line in lines if line.startswith("### **")]


def _assert_common_structure(lines: list[str]) -> None:
    assert _section_headers(lines) == [
        "### **SUMMARY**",
        "### **STUDY**",
        "### **TRAINING**",
        "### **SLEEP**",
        "### **MEDIA**",
    ]
    text = "\n".join(lines)
    assert "TARGET" not in text
    assert "**INTERRUPTS**" not in text
    assert "**OVERRUNS**" not in text


def _summary_line(lines: list[str], metric: str) -> str:
    return next(line for line in lines if f"**{metric}**" in line)


def _minimal_daily(study_minutes: float) -> dict:
    return {
        "study_minutes": study_minutes,
        "sleep_minutes": None,
        "workout": False,
        "stretch": False,
        "meditate": False,
    }


def test_weekly_metrics_block_characterization():
    start, end = iso_week_range(datetime.date(2020, 5, 13))
    daily_data = range_data(start, end)
    prev_start = start - datetime.timedelta(days=7)
    prev_end = end - datetime.timedelta(days=7)
    prev_daily_data = range_data(prev_start, prev_end)

    prior_week_metrics = []
    for weeks_ago in range(4, 0, -1):
        p_start = start - datetime.timedelta(days=7 * weeks_ago)
        p_end = p_start + datetime.timedelta(days=6)
        p_data = range_data(p_start, p_end)
        p_dates = [p_start + datetime.timedelta(days=i) for i in range(7)]
        prior_week_metrics.append(compute_period_metrics(p_dates, p_data))

    first_lines = period_builders.build_weekly_metrics(
        start,
        end,
        daily_data,
        prev_daily_data,
        "**[[2020-W19\\|LAST WEEK]]**",
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_week_metrics=prior_week_metrics,
    )
    second_lines = period_builders.build_weekly_metrics(
        start,
        end,
        daily_data,
        prev_daily_data,
        "**[[2020-W19\\|LAST WEEK]]**",
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_week_metrics=prior_week_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)


def test_monthly_metrics_block_characterization():
    start, end = month_range(2020, 5)
    week_ranges = month_week_ranges(2020, 5)
    daily_data = range_data(start, end)
    prev_start, prev_end = month_range(2020, 4)
    prev_daily_data = range_data(prev_start, prev_end)

    prior_month_metrics = []
    for month_num in (2, 3, 4):
        p_start, p_end = month_range(2020, month_num)
        p_data = range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_month_metrics.append(compute_period_metrics(p_dates, p_data))

    first_lines = period_builders.build_monthly_metrics(
        start,
        end,
        week_ranges,
        daily_data,
        prev_daily_data,
        "THIS MONTH",
        "**[[2020-04\\|LAST MONTH]]**",
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_month_metrics=prior_month_metrics,
    )
    second_lines = period_builders.build_monthly_metrics(
        start,
        end,
        week_ranges,
        daily_data,
        prev_daily_data,
        "THIS MONTH",
        "**[[2020-04\\|LAST MONTH]]**",
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_month_metrics=prior_month_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)


def test_monthly_previous_summary_uses_full_previous_month_denominator():
    start, end = month_range(2020, 5)
    prev_start, _prev_end = month_range(2020, 4)

    lines = period_builders.build_monthly_metrics(
        start,
        end,
        month_week_ranges(2020, 5),
        {},
        {prev_start: _minimal_daily(60.0)},
        "THIS MONTH",
        "**[[2020-04\\|LAST MONTH]]**",
        MediaBundle(books=[], podcasts=[]),
        target_date=end,
    )

    assert "| `0h00m/day` | `0h02m/day` |" in _summary_line(lines, "STUDY")


def test_quarterly_metrics_block_characterization():
    start, end = quarter_range(2020, 3)
    month_ranges = quarter_months(2020, 3)
    daily_data = range_data(start, end)
    prev_start, prev_end = quarter_range(2020, 2)
    prev_daily_data = range_data(prev_start, prev_end)

    prior_quarter_metrics = []
    for year_num, quarter_num in ((2019, 3), (2019, 4), (2020, 1), (2020, 2)):
        p_start, p_end = quarter_range(year_num, quarter_num)
        p_data = range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_quarter_metrics.append(compute_period_metrics(p_dates, p_data))

    first_lines = period_builders.build_quarterly_metrics(
        start,
        end,
        month_ranges,
        daily_data,
        prev_daily_data,
        2020,
        2,
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_quarter_metrics=prior_quarter_metrics,
    )
    second_lines = period_builders.build_quarterly_metrics(
        start,
        end,
        month_ranges,
        daily_data,
        prev_daily_data,
        2020,
        2,
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_quarter_metrics=prior_quarter_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)


def test_quarterly_previous_summary_uses_full_previous_quarter_denominator():
    start, end = quarter_range(2020, 3)
    prev_start, _prev_end = quarter_range(2020, 2)

    lines = period_builders.build_quarterly_metrics(
        start,
        end,
        quarter_months(2020, 3),
        {},
        {prev_start: _minimal_daily(91.0)},
        2020,
        2,
        MediaBundle(books=[], podcasts=[]),
        target_date=end,
    )

    assert "| `0h00m/day` | `0h01m/day` |" in _summary_line(lines, "STUDY")


def test_yearly_metrics_block_characterization():
    year = 2020
    start, end = year_range(year)
    prev_start, prev_end = year_range(year - 1)
    quarter_ranges = year_quarters(year)
    prev_quarter_ranges = year_quarters(year - 1)

    daily_data = range_data(start, end)
    prev_daily_data = range_data(prev_start, prev_end)

    prior_year_metrics = []
    for year_num in (2017, 2018, 2019):
        p_start, p_end = year_range(year_num)
        p_data = range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_year_metrics.append(compute_period_metrics(p_dates, p_data))

    first_lines = period_builders.build_yearly_metrics(
        year,
        start,
        end,
        quarter_ranges,
        prev_quarter_ranges,
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_year_metrics=prior_year_metrics,
    )
    second_lines = period_builders.build_yearly_metrics(
        year,
        start,
        end,
        quarter_ranges,
        prev_quarter_ranges,
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        prior_year_metrics=prior_year_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)
