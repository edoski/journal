"""Query-facing contracts shared by application and CLI layers."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from .metrics import MetricValue


@dataclass(frozen=True)
class PeriodSnapshot:
    """Aggregated metrics view for a date period."""

    period: str
    start: datetime.date
    end: datetime.date
    label: str
    metrics: dict[str, MetricValue]


@dataclass(frozen=True)
class MetricDefinition:
    """Static metadata for a single metric exposed in CLI consumers."""

    key: str
    label: str
    unit: str
    precision: int
    higher_is_better: bool | None
    target: float | None


@dataclass(frozen=True)
class PeriodMetricRow:
    """Explorer row for one metric and its period comparisons."""

    key: str
    label: str
    current: MetricValue
    previous: MetricValue
    delta_pct: float | None
    moving_avg: float | None
    target: float | None


@dataclass(frozen=True)
class BreakdownRow:
    """Breakdown entry for activity/training/screen-time side panels."""

    label: str
    value: float
    percent: float | None


@dataclass(frozen=True)
class PeriodDetailSnapshot:
    """Rich period snapshot used by the explorer screen."""

    period: str
    start: datetime.date
    end: datetime.date
    label: str
    rows: tuple[PeriodMetricRow, ...]
    activity_breakdown: tuple[BreakdownRow, ...]
    training_breakdown: tuple[BreakdownRow, ...]
    screen_time_breakdown: tuple[BreakdownRow, ...]
    days_total: int
    days_with_data: int


@dataclass(frozen=True)
class MetricHistoryPoint:
    """Single point in metric history for the metric-lab timeline."""

    label: str
    start: datetime.date
    end: datetime.date
    value: MetricValue
    delta_pct: float | None
    is_partial: bool


@dataclass(frozen=True)
class MetricHistorySnapshot:
    """Time-series snapshot for one metric across prior periods."""

    metric: str
    period: str
    anchor_label: str
    current: MetricValue
    previous: MetricValue
    delta_pct: float | None
    points: tuple[MetricHistoryPoint, ...]


@dataclass(frozen=True)
class DashboardCard:
    """Compact metric card displayed in dashboard KPI rail."""

    key: str
    label: str
    value: MetricValue
    delta_pct: float | None
    target: float | None


@dataclass(frozen=True)
class DashboardSnapshot:
    """Top-level dashboard payload for the command-center route."""

    anchor_date: datetime.date
    period_label: str
    cards: tuple[DashboardCard, ...]
    alerts: tuple[str, ...]
    trend_study: tuple[MetricHistoryPoint, ...]
    trend_sleep: tuple[MetricHistoryPoint, ...]
    trend_mood: tuple[MetricHistoryPoint, ...]
