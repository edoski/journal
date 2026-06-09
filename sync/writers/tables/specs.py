"""Typed specifications for the unified markdown table API."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Sequence

from sync.contracts.metrics import MetricValue


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
    ma_metrics: Mapping[str, MetricValue] | None = None
    ma_label: str | None = None
    ma_training_unit: str = "7"


TableSpec = SimpleGridTableSpec | SummaryMetricsTableSpec
