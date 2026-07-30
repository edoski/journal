"""Deterministic generators for render baseline fixture artifacts."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import sync.periods.builders as period_builders
from sync.contracts.metrics import PeriodAggregate
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

SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "render_baseline"
PeriodType = Literal["day", "week", "month", "year"]


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
        build_week_window(end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
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
        build_month_window(end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
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


def _yearly_metrics_artifact() -> RenderBaselineArtifact:
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

    lines = period_builders.build_yearly_metrics(
        build_year_window(year, target_date=end),
        daily_data,
        prev_daily_data,
        FIXTURE_MEDIA_BUNDLE,
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


def generate_render_baseline_artifacts() -> tuple[RenderBaselineArtifact, ...]:
    """Generate all deterministic render-baseline artifacts in canonical order."""
    return (
        _weekly_metrics_artifact(),
        _monthly_metrics_artifact(),
        _yearly_metrics_artifact(),
    )


def generate_render_baseline_index() -> dict[str, RenderBaselineArtifact]:
    """Return a name->artifact map for fast lookup."""
    artifacts = generate_render_baseline_artifacts()
    return {artifact.name: artifact for artifact in artifacts}
