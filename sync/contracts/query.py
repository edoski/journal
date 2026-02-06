"""Query-facing contracts shared by application and TUI layers."""

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
