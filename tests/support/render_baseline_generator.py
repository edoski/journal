"""Deterministic generators for render baseline fixture artifacts."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from pathlib import Path

import sync.periods.builders as period_builders
from sync.contracts.goals import Goal
from sync.contracts.metrics import PeriodAggregate
from sync.contracts.targets import PeriodType
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
from sync.target_policy import summary_targets
from sync.writers.goals import build_goals_block, render_goal_lines

from tests.support.period_fixture_data import FIXTURE_MEDIA_BUNDLE, range_data

SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "render_baseline"


@dataclass(frozen=True)
class RenderBaselineArtifact:
    """One deterministic snapshot artifact and optional period policy metadata."""

    name: str
    lines: tuple[str, ...]
    period_type: PeriodType | None = None
    total_days: int | None = None
    current_metrics: PeriodAggregate | None = None


def artifact_text(artifact: RenderBaselineArtifact) -> str:
    """Render fixture lines with the required trailing newline."""
    return "\n".join(artifact.lines) + "\n"


def _weekly_metrics_artifact() -> RenderBaselineArtifact:
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

    lines = period_builders.build_weekly_metrics(
        start,
        end,
        daily_data,
        prev_daily_data,
        "**[[2020-W19\\|LAST WEEK]]**",
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        study_target_minutes=summary_targets("week", 7).study_minutes,
        prior_week_metrics=prior_week_metrics,
    )
    dates = [start + datetime.timedelta(days=i) for i in range(7)]
    current_metrics = compute_period_metrics(dates, daily_data)
    return RenderBaselineArtifact(
        name="weekly_metrics.txt",
        lines=tuple(lines),
        period_type="week",
        total_days=len(dates),
        current_metrics=current_metrics,
    )


def _monthly_metrics_artifact() -> RenderBaselineArtifact:
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

    lines = period_builders.build_monthly_metrics(
        start,
        end,
        week_ranges,
        daily_data,
        prev_daily_data,
        "THIS MONTH",
        "**[[2020-04\\|LAST MONTH]]**",
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        study_target_minutes=summary_targets(
            "month",
            len(list(daterange(start, end))),
        ).study_minutes,
        prior_month_metrics=prior_month_metrics,
    )
    dates = list(daterange(start, end))
    current_metrics = compute_period_metrics(dates, daily_data)
    return RenderBaselineArtifact(
        name="monthly_metrics.txt",
        lines=tuple(lines),
        period_type="month",
        total_days=len(dates),
        current_metrics=current_metrics,
    )


def _quarterly_metrics_artifact() -> RenderBaselineArtifact:
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

    lines = period_builders.build_quarterly_metrics(
        start,
        end,
        month_ranges,
        daily_data,
        prev_daily_data,
        2020,
        2,
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        study_target_minutes=summary_targets(
            "quarter",
            len(list(daterange(start, end))),
        ).study_minutes,
        prior_quarter_metrics=prior_quarter_metrics,
    )
    dates = list(daterange(start, end))
    current_metrics = compute_period_metrics(dates, daily_data)
    return RenderBaselineArtifact(
        name="quarterly_metrics.txt",
        lines=tuple(lines),
        period_type="quarter",
        total_days=len(dates),
        current_metrics=current_metrics,
    )


def _yearly_metrics_artifact() -> RenderBaselineArtifact:
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

    lines = period_builders.build_yearly_metrics(
        year,
        start,
        end,
        quarter_ranges,
        prev_quarter_ranges,
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
        target_date=end,
        study_target_minutes=summary_targets(
            "year",
            len(list(daterange(start, end))),
        ).study_minutes,
        prior_year_metrics=prior_year_metrics,
    )
    dates = list(daterange(start, end))
    current_metrics = compute_period_metrics(dates, daily_data)
    return RenderBaselineArtifact(
        name="yearly_metrics.txt",
        lines=tuple(lines),
        period_type="year",
        total_days=len(dates),
        current_metrics=current_metrics,
    )


def _goal_lines_artifact() -> RenderBaselineArtifact:
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

    return RenderBaselineArtifact(
        name="goal_lines.txt",
        lines=tuple(render_goal_lines(goals, today=today)),
    )


def _goals_block_artifact() -> RenderBaselineArtifact:
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
    return RenderBaselineArtifact(
        name="goals_block.txt",
        lines=tuple(block),
    )


def generate_render_baseline_artifacts() -> tuple[RenderBaselineArtifact, ...]:
    """Generate all deterministic render-baseline artifacts in canonical order."""
    return (
        _weekly_metrics_artifact(),
        _monthly_metrics_artifact(),
        _quarterly_metrics_artifact(),
        _yearly_metrics_artifact(),
        _goal_lines_artifact(),
        _goals_block_artifact(),
    )


def generate_render_baseline_index() -> dict[str, RenderBaselineArtifact]:
    """Return a name->artifact map for fast lookup."""
    artifacts = generate_render_baseline_artifacts()
    return {artifact.name: artifact for artifact in artifacts}
