"""Shared period metrics rendering engine facade."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.periods.builders.monthly import (
    build_monthly_metrics as _build_monthly_metrics,
)
from sync.periods.builders.quarterly import (
    build_quarterly_metrics as _build_quarterly_metrics,
)
from sync.periods.builders.weekly import build_weekly_metrics as _build_weekly_metrics
from sync.periods.builders.yearly import build_yearly_metrics as _build_yearly_metrics


def build_weekly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_week_label: str,
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    study_target_minutes: int | None,
    prior_week_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    return _build_weekly_metrics(
        start_date,
        end_date,
        daily_data,
        prev_daily_data,
        prev_week_label,
        media_bundle,
        target_date=target_date,
        study_target_minutes=study_target_minutes,
        prior_week_metrics=prior_week_metrics,
    )


def build_monthly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    week_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    current_month_label: str,
    prev_month_label: str,
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    study_target_minutes: int | None,
    prior_month_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    return _build_monthly_metrics(
        start_date,
        end_date,
        week_ranges,
        daily_data,
        prev_daily_data,
        current_month_label,
        prev_month_label,
        media_bundle,
        target_date=target_date,
        study_target_minutes=study_target_minutes,
        prior_month_metrics=prior_month_metrics,
    )


def build_quarterly_metrics(
    quarter_start: datetime.date,
    quarter_end: datetime.date,
    month_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_year: int,
    prev_quarter: int,
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    study_target_minutes: int | None,
    prior_quarter_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    return _build_quarterly_metrics(
        quarter_start,
        quarter_end,
        month_ranges,
        daily_data,
        prev_daily_data,
        prev_year,
        prev_quarter,
        media_bundle,
        target_date=target_date,
        study_target_minutes=study_target_minutes,
        prior_quarter_metrics=prior_quarter_metrics,
    )


def build_yearly_metrics(
    year: int,
    year_start: datetime.date,
    year_end: datetime.date,
    quarter_ranges: list[tuple[datetime.date, datetime.date]],
    prev_quarter_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    study_target_minutes: int | None,
    prior_year_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    return _build_yearly_metrics(
        year,
        year_start,
        year_end,
        quarter_ranges,
        prev_quarter_ranges,
        daily_data,
        prev_daily_data,
        media_bundle,
        target_date=target_date,
        study_target_minutes=study_target_minutes,
        prior_year_metrics=prior_year_metrics,
    )
