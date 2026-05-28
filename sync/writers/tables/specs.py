"""Typed specifications for the unified markdown table API."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Sequence

from sync.contracts.metrics import MetricValue
from sync.contracts.targets import PeriodType
from sync.contracts.deviation import DailyDeviationData
from sync.contracts.screen_time import DailyScreenTimeData


@dataclass(frozen=True)
class SimpleGridTableSpec:
    """Spec for a generic markdown grid table."""

    headers: Sequence[str]
    rows: Sequence[Sequence[str]]
    divider_cells: Sequence[str] | None = None


@dataclass(frozen=True)
class SummaryMetricsTableSpec:
    """Spec for period summary metrics table section."""

    current_metrics: Mapping[str, MetricValue]
    previous_metrics: Mapping[str, MetricValue]
    current_label: str
    previous_label: str
    study_target_minutes: int | None
    ma_metrics: Mapping[str, MetricValue] | None = None
    ma_label: str | None = None
    ma_training_unit: str = "7"
    period_type: PeriodType = "week"
    total_days: int = 7


@dataclass(frozen=True)
class ScreenTrendTableSpec:
    """Spec for period screen-time trend markdown table."""

    period_label: str
    rows: Sequence[Sequence[str]]


@dataclass(frozen=True)
class DailyProcrastinationTableSpec:
    """Spec for daily procrastination section markdown table."""

    screen_time_data: DailyScreenTimeData | None
    deviation_data: DailyDeviationData | None = None
    max_total_minutes: float | None = None
    include_section_title: bool = True


TableSpec = (
    SimpleGridTableSpec
    | SummaryMetricsTableSpec
    | ScreenTrendTableSpec
    | DailyProcrastinationTableSpec
)
