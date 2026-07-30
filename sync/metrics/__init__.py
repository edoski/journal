"""
Period metrics computation for the journal sync system.

Provides functions for aggregating study, sleep, and training
metrics across date ranges, and computing period-over-period deltas.
"""

from __future__ import annotations

from .aggregation import (
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    aggregate_training_type_session_stats,
    compute_period_metrics,
)
from .trends import (
    compute_bucket_deltas,
    compute_moving_average,
)

__all__ = [
    "compute_period_metrics",
    "aggregate_activity_totals",
    "aggregate_interrupt_overrun",
    "aggregate_training_type_session_stats",
    "compute_bucket_deltas",
    "compute_moving_average",
]
