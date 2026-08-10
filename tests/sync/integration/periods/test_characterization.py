"""Characterization tests for period metric block builders."""

from __future__ import annotations

import datetime

import sync.periods.builders as period_builders
from sync.contracts.media import MediaBundle
from sync.dates import (
    daterange,
    iso_week_range,
    month_range,
    year_range,
)
from sync.metrics import compute_period_metrics
from sync.periods.windows import (
    build_month_window,
    build_week_window,
    build_year_window,
)
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


def _section_text(lines: list[str], start_header: str, end_header: str) -> str:
    start_index = lines.index(start_header)
    end_index = lines.index(end_header)
    return "\n".join(lines[start_index:end_index])


def _minimal_daily(study_minutes: float) -> dict:
    return {
        "study_minutes": study_minutes,
        "sleep_minutes": None,
        "workout": False,
        "stretch": False,
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
        build_week_window(end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        prior_week_metrics=prior_week_metrics,
    )
    second_lines = period_builders.build_weekly_metrics(
        build_week_window(end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        prior_week_metrics=prior_week_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)


def test_yearly_training_calendar_stops_at_current_month():
    year = 2020
    start, end = year_range(year)
    prev_start, prev_end = year_range(year - 1)
    target_date = datetime.date(2020, 7, 8)

    lines = period_builders.build_yearly_metrics(
        build_year_window(year, target_date=target_date),
        range_data(start, end),
        range_data(prev_start, prev_end),
        FIXTURE_MEDIA_BUNDLE,
    )

    training_text = _section_text(lines, "### **TRAINING**", "### **SLEEP**")
    assert "┌ Q3" in training_text
    assert "│ JUL" in training_text
    assert "│ AUG" not in training_text
    assert "│ SEP" not in training_text
    assert "┌ Q4" not in training_text


def test_monthly_metrics_block_characterization():
    start, end = month_range(2020, 5)
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
        build_month_window(end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        prior_month_metrics=prior_month_metrics,
    )
    second_lines = period_builders.build_monthly_metrics(
        build_month_window(end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        prior_month_metrics=prior_month_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)


def test_monthly_previous_summary_uses_full_previous_month_denominator():
    start, end = month_range(2020, 5)
    prev_start, _prev_end = month_range(2020, 4)

    lines = period_builders.build_monthly_metrics(
        build_month_window(end),
        {},
        {prev_start: _minimal_daily(60.0)},
        MediaBundle(books=[], podcasts=[], series=[]),
    )

    assert "| `0h00m/day` | `0h02m/day` |" in _summary_line(lines, "STUDY")


def test_yearly_metrics_block_characterization():
    year = 2020
    start, end = year_range(year)
    prev_start, prev_end = year_range(year - 1)
    daily_data = range_data(start, end)
    prev_daily_data = range_data(prev_start, prev_end)

    prior_year_metrics = []
    for year_num in (2017, 2018, 2019):
        p_start, p_end = year_range(year_num)
        p_data = range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_year_metrics.append(compute_period_metrics(p_dates, p_data))

    first_lines = period_builders.build_yearly_metrics(
        build_year_window(year, target_date=end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        prior_year_metrics=prior_year_metrics,
    )
    second_lines = period_builders.build_yearly_metrics(
        build_year_window(year, target_date=end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        prior_year_metrics=prior_year_metrics,
    )

    assert first_lines == second_lines
    _assert_common_structure(first_lines)
