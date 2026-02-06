"""Snapshot guards for markdown rendering invariance."""

from __future__ import annotations

import datetime
from pathlib import Path

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
from sync.models.goals import Goal
from sync.writers.goals import build_goals_block, render_goal_lines

FIXTURE_MEDIA_BUNDLE = MediaBundle(
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

SNAPSHOT_DIR = Path(__file__).parents[1] / "fixtures" / "render_baseline"


def _payload_for_date(day: datetime.date) -> dict:
    """Create deterministic daily payload for snapshot testing."""
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


def _assert_snapshot(name: str, lines: list[str]) -> None:
    path = SNAPSHOT_DIR / name
    expected_raw = path.read_text(encoding="utf-8")
    assert expected_raw.endswith("\n"), f"Snapshot must end with newline: {path}"

    expected_lines = expected_raw.splitlines()
    assert len(lines) == len(expected_lines), (
        f"Line count mismatch for {path}: "
        f"expected {len(expected_lines)}, got {len(lines)}"
    )
    assert lines == expected_lines, f"Content mismatch for snapshot {path}"

    actual_raw = "\n".join(lines) + "\n"
    assert actual_raw == expected_raw, f"Raw newline/spacing drift in snapshot {path}"


def test_weekly_metrics_snapshot(monkeypatch):
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
        FIXTURE_MEDIA_BUNDLE,
        prior_week_metrics=prior_week_metrics,
    )

    _assert_snapshot("weekly_metrics.txt", lines)


def test_monthly_metrics_snapshot(monkeypatch):
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
        FIXTURE_MEDIA_BUNDLE,
        prior_month_metrics=prior_month_metrics,
    )

    _assert_snapshot("monthly_metrics.txt", lines)


def test_quarterly_metrics_snapshot(monkeypatch):
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
        FIXTURE_MEDIA_BUNDLE,
        prior_quarter_metrics=prior_quarter_metrics,
    )

    _assert_snapshot("quarterly_metrics.txt", lines)


def test_yearly_metrics_snapshot(monkeypatch):
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
        FIXTURE_MEDIA_BUNDLE,
        prior_year_metrics=prior_year_metrics,
    )

    _assert_snapshot("yearly_metrics.txt", lines)


def test_goal_lines_snapshot():
    today = datetime.date(2026, 2, 6)
    goals = [
        Goal(
            id="gid-aaa1111111",
            body="Quarterly planning",
            done=False,
            date_str="2026-02-20",
            deadline=datetime.date(2026, 2, 20),
            reminder_offset=7,
        ),
        Goal(
            id="gid-bbb2222222",
            body="Retrospective",
            done=True,
            date_str="2026-02-05",
            deadline=datetime.date(2026, 2, 5),
            reminder_offset=0,
        ),
    ]

    lines = render_goal_lines(goals, today=today)
    _assert_snapshot("goal_lines.txt", lines)


def test_goals_block_snapshot():
    today = datetime.date(2026, 2, 6)
    weekly_goals = [
        Goal(
            id="gid-aaa1111111",
            body="Quarterly planning",
            done=False,
            date_str="2026-02-20",
            deadline=datetime.date(2026, 2, 20),
            reminder_offset=7,
        )
    ]
    daily_goals = [
        Goal(
            id="gid-ccc3333333",
            body="Deep work block",
            done=False,
            date_str="2026-02-06",
            deadline=datetime.date(2026, 2, 6),
            reminder_offset=0,
        )
    ]

    weekly_lines = render_goal_lines(weekly_goals, today=today)
    daily_lines = render_goal_lines(daily_goals, today=today)
    block = build_goals_block([("WEEKLY", weekly_lines), ("DAILY", daily_lines)])

    _assert_snapshot("goals_block.txt", block)
