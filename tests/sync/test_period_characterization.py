"""
Characterization tests for period metric block builders.

These tests lock down high-level markdown output by comparing stable hashes
for fixed synthetic datasets.
"""

from __future__ import annotations

import datetime
import hashlib

import sync.periods.engine as period_engine
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
from sync.models.media import Book


_FIXTURE_MEDIA_BUNDLE = MediaBundle(
    books=[
        Book(
            title="Fixture Book",
            author="Fixture Author",
            started=datetime.date(2019, 12, 1),
            completed=datetime.date(2020, 1, 1),
            rating=None,
        )
    ],
    podcasts=[],
)


def _payload_for_date(day: datetime.date) -> dict:
    """Create deterministic daily payload for characterization testing."""
    idx = day.toordinal()
    study = float((idx % 8) * 60)
    coding = float(round(study * 0.65))
    reading = float(max(0.0, study - coding))
    return {
        "study_minutes": study,
        "sleep_minutes": float(390 + (idx % 7) * 15),
        "mood": float(4.5 + (idx % 11) * 0.5),
        "workout": idx % 3 == 0,
        "stretch": idx % 2 == 0,
        "meditate": idx % 4 in {0, 1},
        "awake_minutes": float(10 + (idx % 5) * 5),
        "awakenings": int((idx % 4) + 1),
        "activity_totals": (
            {"coding": coding, "reading": reading} if study > 0 else {}
        ),
        "interrupt_minutes": float((idx % 6) * 3),
        "overrun_minutes": float((idx % 5) * 2),
        "planned_break_minutes": float(5 + (idx % 3) * 5),
        "screen_time_totals": {
            "YouTube": float((idx % 4) * 12),
            "X": float((idx % 3) * 7),
            "Netflix": float(20 if idx % 5 == 0 else 0),
        },
    }


def _range_data(start: datetime.date, end: datetime.date) -> dict[datetime.date, dict]:
    return {d: _payload_for_date(d) for d in daterange(start, end)}


def _hash_lines(lines: list[str]) -> str:
    joined = "\n".join(lines)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def test_weekly_metrics_block_characterization(monkeypatch):
    _ = monkeypatch

    start, end = iso_week_range(datetime.date(2020, 5, 13))
    daily_data = _range_data(start, end)
    prev_start = start - datetime.timedelta(days=7)
    prev_end = end - datetime.timedelta(days=7)
    prev_daily_data = _range_data(prev_start, prev_end)

    prior_week_metrics = []
    for weeks_ago in range(4, 0, -1):
        p_start = start - datetime.timedelta(days=7 * weeks_ago)
        p_end = p_start + datetime.timedelta(days=6)
        p_data = _range_data(p_start, p_end)
        p_dates = [p_start + datetime.timedelta(days=i) for i in range(7)]
        prior_week_metrics.append(compute_period_metrics(p_dates, p_data))

    lines = period_engine.build_weekly_metrics(
        start,
        end,
        daily_data,
        prev_daily_data,
        "**[[2020-W19\\|LAST WEEK]]**",
        _FIXTURE_MEDIA_BUNDLE,
        prior_week_metrics=prior_week_metrics,
    )

    assert (
        _hash_lines(lines)
        == "e2323f6d5af610397b43948901a462436ff4a260bcf9f73591852628594ae914"
    )


def test_monthly_metrics_block_characterization(monkeypatch):
    _ = monkeypatch

    start, end = month_range(2020, 5)
    week_ranges = month_week_ranges(2020, 5)
    daily_data = _range_data(start, end)
    prev_start, prev_end = month_range(2020, 4)
    prev_daily_data = _range_data(prev_start, prev_end)

    prior_month_metrics = []
    for month_num in (2, 3, 4):
        p_start, p_end = month_range(2020, month_num)
        p_data = _range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_month_metrics.append(compute_period_metrics(p_dates, p_data))

    lines = period_engine.build_monthly_metrics(
        start,
        end,
        week_ranges,
        daily_data,
        prev_daily_data,
        "THIS MONTH",
        "**[[2020-04\\|LAST MONTH]]**",
        _FIXTURE_MEDIA_BUNDLE,
        prior_month_metrics=prior_month_metrics,
    )

    assert (
        _hash_lines(lines)
        == "e8b34ab4923961b624ce39f1aa2a511a4b5fb00d06a0da5847604a1c27ef9149"
    )


def test_quarterly_metrics_block_characterization(monkeypatch):
    _ = monkeypatch

    start, end = quarter_range(2020, 3)
    month_ranges = quarter_months(2020, 3)
    daily_data = _range_data(start, end)
    prev_start, prev_end = quarter_range(2020, 2)
    prev_daily_data = _range_data(prev_start, prev_end)

    prior_quarter_metrics = []
    for year_num, quarter_num in ((2019, 3), (2019, 4), (2020, 1), (2020, 2)):
        p_start, p_end = quarter_range(year_num, quarter_num)
        p_data = _range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_quarter_metrics.append(compute_period_metrics(p_dates, p_data))

    lines = period_engine.build_quarterly_metrics(
        start,
        end,
        month_ranges,
        daily_data,
        prev_daily_data,
        2020,
        2,
        _FIXTURE_MEDIA_BUNDLE,
        prior_quarter_metrics=prior_quarter_metrics,
    )

    assert (
        _hash_lines(lines)
        == "683bb9731e815b9d6747bc8b34c5c2e266481c37c05675be6e5f4060d5a8963d"
    )


def test_yearly_metrics_block_characterization(monkeypatch):
    _ = monkeypatch

    year = 2020
    start, end = year_range(year)
    prev_start, prev_end = year_range(year - 1)
    quarter_ranges = year_quarters(year)
    prev_quarter_ranges = year_quarters(year - 1)

    daily_data = _range_data(start, end)
    prev_daily_data = _range_data(prev_start, prev_end)

    prior_year_metrics = []
    for year_num in (2017, 2018, 2019):
        p_start, p_end = year_range(year_num)
        p_data = _range_data(p_start, p_end)
        p_dates = list(daterange(p_start, p_end))
        prior_year_metrics.append(compute_period_metrics(p_dates, p_data))

    lines = period_engine.build_yearly_metrics(
        year,
        start,
        end,
        quarter_ranges,
        prev_quarter_ranges,
        daily_data,
        prev_daily_data,
        _FIXTURE_MEDIA_BUNDLE,
        prior_year_metrics=prior_year_metrics,
    )

    assert (
        _hash_lines(lines)
        == "74aa5f6e8e5f8bfad1c337ce5814f4f21bdae5ba9a762706498fff131d22c5fe"
    )
