"""Typed specifications for the unified markdown table API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from sync.contracts.finance import SpentSummary
from sync.contracts.metrics import MovingAverageAggregate, PeriodAggregate


@dataclass(frozen=True)
class SimpleGridTableSpec:
    """Spec for a generic markdown grid table."""

    headers: Sequence[str]
    rows: Sequence[Sequence[str]]
    divider_cells: Sequence[str] | None = None


@dataclass(frozen=True)
class SummaryMetricsTableSpec:
    """Spec for period summary metrics table section."""

    current_metrics: PeriodAggregate
    previous_metrics: PeriodAggregate
    current_label: str
    previous_label: str
    ma_metrics: MovingAverageAggregate | None = None
    ma_label: str | None = None
    ma_training_unit: str = "7"
    spent: SpentSummary | None = None


TableSpec = SimpleGridTableSpec | SummaryMetricsTableSpec
