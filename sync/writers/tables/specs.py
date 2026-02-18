"""Typed specifications for the unified markdown table API."""

from __future__ import annotations

import datetime
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Sequence

from sync.contracts.metrics import (
    DailyAggregate,
    MetricValue,
)
from sync.contracts.targets import PeriodType
from sync.models.deviation import DailyDeviationData
from sync.models.screen_time import DailyScreenTimeData


class TableKind(str, Enum):
    """Top-level table families supported by ``render_table``."""

    SIMPLE_GRID = "simple_grid"
    SUMMARY_METRICS = "summary_metrics"
    SCREEN_TREND = "screen_trend"
    DAILY_PROCRASTINATION = "daily_procrastination"


@dataclass(frozen=True)
class SimpleGridTableSpec:
    """Spec for a generic markdown grid table."""

    headers: Sequence[str]
    rows: Sequence[Sequence[str]]
    divider_cells: Sequence[str] | None = None
    kind: TableKind = TableKind.SIMPLE_GRID


@dataclass(frozen=True)
class SummaryMetricsTableSpec:
    """Spec for period summary metrics table section."""

    current_metrics: Mapping[str, MetricValue]
    previous_metrics: Mapping[str, MetricValue]
    current_label: str
    previous_label: str
    ma_metrics: Mapping[str, MetricValue] | None = None
    ma_label: str | None = None
    ma_training_unit: str = "7"
    period_type: PeriodType = "week"
    total_days: int = 7
    kind: TableKind = TableKind.SUMMARY_METRICS


class ScreenTrendMode(str, Enum):
    """Screen trend table data shape."""

    DAILY = "daily"
    PERIOD = "period"


@dataclass(frozen=True)
class ScreenTrendTableSpec:
    """Spec for period screen-time trend markdown table."""

    mode: ScreenTrendMode
    period_label: str
    daily_data: dict[datetime.date, DailyAggregate]
    dates: Sequence[datetime.date] | None = None
    period_ranges: Sequence[tuple[datetime.date, datetime.date]] | None = None
    labels: Sequence[str] | None = None
    wikilinks: Sequence[str] | None = None
    include_total_row: bool = True
    kind: TableKind = TableKind.SCREEN_TREND


@dataclass(frozen=True)
class DailyProcrastinationTableSpec:
    """Spec for daily procrastination section markdown table."""

    screen_time_data: DailyScreenTimeData | None
    deviation_data: DailyDeviationData | None = None
    include_section_title: bool = True
    kind: TableKind = TableKind.DAILY_PROCRASTINATION


TableSpec = (
    SimpleGridTableSpec
    | SummaryMetricsTableSpec
    | ScreenTrendTableSpec
    | DailyProcrastinationTableSpec
)
